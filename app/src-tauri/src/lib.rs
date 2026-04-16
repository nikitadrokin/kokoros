use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use kokoros::tts::koko::{TTSKoko, WordAlignment};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tokio::sync::Mutex;

struct AppState {
  engine: Mutex<Option<CachedEngine>>,
}

struct CachedEngine {
  model_path: PathBuf,
  data_path: PathBuf,
  engine: TTSKoko,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SynthesizeSpeechRequest {
  text: String,
  language: Option<String>,
  style: Option<String>,
  speed: Option<f32>,
  model_path: Option<String>,
  data_path: Option<String>,
  output_path: Option<String>,
  initial_silence: Option<usize>,
  mono: bool,
  timestamps: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TimestampRow {
  word: String,
  start_sec: f32,
  end_sec: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SynthesizeSpeechResponse {
  audio_base64: String,
  sample_rate: u32,
  saved_output_path: Option<String>,
  saved_timestamps_path: Option<String>,
  timestamps: Vec<TimestampRow>,
}

#[tauri::command]
async fn synthesize_speech(
  request: SynthesizeSpeechRequest,
  state: tauri::State<'_, AppState>,
) -> Result<SynthesizeSpeechResponse, String> {
  let text = request.text.trim().to_string();
  if text.is_empty() {
    return Err("Enter some text before generating audio.".into());
  }

  let language = request
    .language
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .unwrap_or("en-us")
    .to_string();
  let style = request
    .style
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .unwrap_or("af_heart")
    .to_string();
  let speed = request.speed.unwrap_or(1.0);

  let model_path = resolve_repo_path(request.model_path.as_deref(), "checkpoints/kokoro-v1.0.onnx");
  let data_path = resolve_repo_path(request.data_path.as_deref(), "data/voices-v1.0.bin");
  let output_path = request
    .output_path
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(|value| resolve_repo_path(Some(value), value));

  let engine = get_or_load_engine(&state, &model_path, &data_path).await?;
  let timestamps_requested = request.timestamps;
  let mono = request.mono;
  let initial_silence = request.initial_silence;

  let synthesis = tauri::async_runtime::spawn_blocking(move || {
    if timestamps_requested {
      let (audio, alignments) = engine
        .tts_timestamped_raw_audio(
          &text,
          &language,
          &style,
          speed,
          initial_silence,
          None,
          None,
          None,
        )
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "The synthesizer did not produce audio.".to_string())?;
      Ok::<_, String>((audio, alignments))
    } else {
      let audio = engine
        .tts_raw_audio(&text, &language, &style, speed, initial_silence, None, None, None)
        .map_err(|error| error.to_string())?;
      Ok((audio, Vec::new()))
    }
  })
  .await
  .map_err(|error| error.to_string())??;

  let wav_bytes = write_wav_bytes(&synthesis.0, mono)?;

  let mut saved_output_path = None;
  let mut saved_timestamps_path = None;

  if let Some(path) = output_path {
    save_bytes(&path, &wav_bytes)?;
    saved_output_path = Some(path.display().to_string());

    if timestamps_requested {
      let tsv_path = derive_tsv_path_from_wav(&path);
      write_tsv(&tsv_path, &synthesis.1)?;
      saved_timestamps_path = Some(tsv_path.display().to_string());
    }
  }

  let timestamps = synthesis
    .1
    .into_iter()
    .map(|item| TimestampRow {
      word: item.word,
      start_sec: item.start_sec,
      end_sec: item.end_sec,
    })
    .collect();

  Ok(SynthesizeSpeechResponse {
    audio_base64: BASE64.encode(wav_bytes),
    sample_rate: 24_000,
    saved_output_path,
    saved_timestamps_path,
    timestamps,
  })
}

async fn get_or_load_engine(
  state: &tauri::State<'_, AppState>,
  model_path: &Path,
  data_path: &Path,
) -> Result<TTSKoko, String> {
  let mut guard = state.engine.lock().await;

  if let Some(cached) = guard.as_ref() {
    if cached.model_path == model_path && cached.data_path == data_path {
      return Ok(cached.engine.clone());
    }
  }

  let engine = TTSKoko::new(&model_path.to_string_lossy(), &data_path.to_string_lossy()).await;
  let cached = CachedEngine {
    model_path: model_path.to_path_buf(),
    data_path: data_path.to_path_buf(),
    engine: engine.clone(),
  };

  *guard = Some(cached);
  Ok(engine)
}

fn resolve_repo_path(input: Option<&str>, fallback: &str) -> PathBuf {
  let value = input
    .map(str::trim)
    .filter(|candidate| !candidate.is_empty())
    .unwrap_or(fallback);
  let path = Path::new(value);

  if path.is_absolute() {
    path.to_path_buf()
  } else {
    repo_root().join(path)
  }
}

fn repo_root() -> PathBuf {
  Path::new(env!("CARGO_MANIFEST_DIR"))
    .ancestors()
    .nth(2)
    .expect("repo root")
    .to_path_buf()
}

fn derive_tsv_path_from_wav(path: &Path) -> PathBuf {
  if let Some(stem) = path.file_stem().and_then(|value| value.to_str()) {
    let parent = path.parent().unwrap_or_else(|| Path::new(""));
    return parent.join(format!("{stem}.tsv"));
  }

  PathBuf::from(format!("{}.tsv", path.display()))
}

fn save_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }

  fs::write(path, bytes).map_err(|error| error.to_string())
}

fn write_tsv(path: &Path, alignments: &[WordAlignment]) -> Result<(), String> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }

  let mut output = String::from("word\tstart_sec\tend_sec\n");
  for item in alignments {
    output.push_str(&format!(
      "{}\t{:.3}\t{:.3}\n",
      item.word, item.start_sec, item.end_sec
    ));
  }

  fs::write(path, output).map_err(|error| error.to_string())
}

fn write_wav_bytes(samples: &[f32], mono: bool) -> Result<Vec<u8>, String> {
  let channels = if mono { 1_u16 } else { 2_u16 };
  let bits_per_sample = 32_u16;
  let bytes_per_sample = u32::from(bits_per_sample) / 8;
  let frames_to_write = if mono {
    samples.len()
  } else {
    samples
      .len()
      .checked_mul(2)
      .ok_or_else(|| "Audio output was too large.".to_string())?
  };
  let data_size = (frames_to_write as u32)
    .checked_mul(bytes_per_sample)
    .ok_or_else(|| "Audio output was too large.".to_string())?;
  let riff_chunk_size = 36_u32
    .checked_add(data_size)
    .ok_or_else(|| "Audio output was too large.".to_string())?;
  let byte_rate = 24_000_u32
    .checked_mul(u32::from(channels) * bytes_per_sample)
    .ok_or_else(|| "Audio output was too large.".to_string())?;
  let block_align = channels * (bits_per_sample / 8);

  let mut bytes = Vec::with_capacity((data_size as usize) + 44);
  bytes.extend_from_slice(b"RIFF");
  bytes.extend_from_slice(&riff_chunk_size.to_le_bytes());
  bytes.extend_from_slice(b"WAVE");
  bytes.extend_from_slice(b"fmt ");
  bytes.extend_from_slice(&(16_u32).to_le_bytes());
  bytes.extend_from_slice(&(3_u16).to_le_bytes());
  bytes.extend_from_slice(&channels.to_le_bytes());
  bytes.extend_from_slice(&(24_000_u32).to_le_bytes());
  bytes.extend_from_slice(&byte_rate.to_le_bytes());
  bytes.extend_from_slice(&block_align.to_le_bytes());
  bytes.extend_from_slice(&bits_per_sample.to_le_bytes());
  bytes.extend_from_slice(b"data");
  bytes.extend_from_slice(&data_size.to_le_bytes());

  if mono {
    for sample in samples {
      bytes.extend_from_slice(&sample.to_le_bytes());
    }
  } else {
    for sample in samples {
      bytes.extend_from_slice(&sample.to_le_bytes());
      bytes.extend_from_slice(&sample.to_le_bytes());
    }
  }

  Ok(bytes)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(AppState {
      engine: Mutex::new(None),
    })
    .invoke_handler(tauri::generate_handler![synthesize_speech])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
