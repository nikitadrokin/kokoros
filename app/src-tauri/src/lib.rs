use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use std::{
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::{process::Output, ShellExt};
use tauri_plugin_updater::{Update, UpdaterExt};

const KOKO_SIDECAR: &str = "koko";
const MODEL_RESOURCE_PATH: &str = "models/kokoro-v1.0.onnx";
const VOICES_RESOURCE_PATH: &str = "models/voices-v1.0.bin";
const DEV_MODEL_PATH: &str = "checkpoints/kokoro-v1.0.onnx";
const DEV_VOICES_PATH: &str = "data/voices-v1.0.bin";

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
    save_to_disk: Option<bool>,
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
    audio_base64: Option<String>,
    sample_rate: u32,
    saved_output_path: Option<String>,
    saved_timestamps_path: Option<String>,
    timestamps: Vec<TimestampRow>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedAudioFile {
    name: String,
    path: String,
    modified_sec: Option<u64>,
    size_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppUpdateResponse {
    status: AppUpdateStatus,
    version: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
enum AppUpdateStatus {
    Prepared,
    UpToDate,
    Restarting,
}

#[derive(Default)]
struct PreparedAppUpdateState {
    update: Mutex<Option<PreparedAppUpdate>>,
}

struct PreparedAppUpdate {
    version: String,
    update: Update,
    bytes: Vec<u8>,
}

#[tauri::command]
async fn synthesize_speech(
    request: SynthesizeSpeechRequest,
    app: AppHandle,
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
    let timestamps_requested = request.timestamps;
    let mono = request.mono;
    let save_to_disk = request.save_to_disk.unwrap_or(false);

    let model_path = resolve_input_or_resource(
        &app,
        request.model_path.as_deref(),
        MODEL_RESOURCE_PATH,
        DEV_MODEL_PATH,
    )?;
    let data_path = resolve_input_or_resource(
        &app,
        request.data_path.as_deref(),
        VOICES_RESOURCE_PATH,
        DEV_VOICES_PATH,
    )?;

    let requested_output_path = request
        .output_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let should_keep_output = requested_output_path.is_some() || save_to_disk;
    let output_path = if let Some(path) = requested_output_path {
        resolve_output_path(&app, path)?
    } else if save_to_disk {
        create_saved_output_path(&app)?
    } else {
        create_temp_output_path(&app)?
    };

    ensure_parent_dir(&output_path)?;

    let mut args = Vec::<OsString>::new();
    args.extend([
        OsString::from("--lan"),
        OsString::from(language),
        OsString::from("--model"),
        model_path.into_os_string(),
        OsString::from("--data"),
        data_path.into_os_string(),
        OsString::from("--style"),
        OsString::from(style),
        OsString::from("--speed"),
        OsString::from(speed.to_string()),
    ]);

    if mono {
        args.push(OsString::from("--mono"));
    }

    if let Some(initial_silence) = request.initial_silence {
        args.push(OsString::from("--initial-silence"));
        args.push(OsString::from(initial_silence.to_string()));
    }

    if timestamps_requested {
        args.push(OsString::from("--timestamps"));
    }

    args.push(OsString::from("text"));
    args.push(OsString::from("--output"));
    args.push(output_path.clone().into_os_string());
    args.push(OsString::from(text));

    let output = app
        .shell()
        .sidecar(KOKO_SIDECAR)
        .map_err(|error| error.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(format_command_failure(&output));
    }

    let audio_base64 = if should_keep_output {
        if !output_path.exists() {
            return Err(format!(
                "koko completed but did not create `{}`. {}",
                output_path.display(),
                command_log(&output)
            ));
        }
        None
    } else {
        let wav_bytes = fs::read(&output_path).map_err(|error| {
            format!(
                "Failed to read generated audio: {error}. {}",
                command_log(&output)
            )
        })?;
        Some(BASE64.encode(wav_bytes))
    };

    let tsv_path = derive_tsv_path_from_wav(&output_path);
    let timestamps = if timestamps_requested {
        read_timestamps(&tsv_path)?
    } else {
        Vec::new()
    };

    let saved_output_path = should_keep_output.then(|| output_path.display().to_string());
    let saved_timestamps_path = if timestamps_requested && should_keep_output {
        Some(tsv_path.display().to_string())
    } else {
        None
    };

    if !should_keep_output {
        let _ = fs::remove_file(&output_path);
        if timestamps_requested {
            let _ = fs::remove_file(&tsv_path);
        }
    }

    Ok(SynthesizeSpeechResponse {
        audio_base64,
        sample_rate: 24_000,
        saved_output_path,
        saved_timestamps_path,
        timestamps,
    })
}

#[tauri::command]
fn list_saved_audio(app: AppHandle) -> Result<Vec<SavedAudioFile>, String> {
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("synthesis");

    if !base_dir.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    for entry in fs::read_dir(&base_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let metadata = entry.metadata().map_err(|error| error.to_string())?;

        if !metadata.is_file() || path.extension().and_then(|value| value.to_str()) != Some("wav") {
            continue;
        }

        let modified_sec = metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
            .map(|value| value.as_secs());
        let name = path
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| path.display().to_string());

        files.push(SavedAudioFile {
            name,
            path: path.display().to_string(),
            modified_sec,
            size_bytes: metadata.len(),
        });
    }

    files.sort_by(|left, right| {
        right
            .modified_sec
            .cmp(&left.modified_sec)
            .then_with(|| left.name.cmp(&right.name))
    });

    Ok(files)
}

#[tauri::command]
async fn prepare_app_update(
    app: AppHandle,
    prepared_update: State<'_, PreparedAppUpdateState>,
) -> Result<AppUpdateResponse, String> {
    let update = app
        .updater()
        .map_err(|error| format!("Failed to initialize updater: {error}"))?
        .check()
        .await
        .map_err(|error| format!("Failed to check for updates: {error}"))?;

    let Some(update) = update else {
        return Ok(AppUpdateResponse {
            status: AppUpdateStatus::UpToDate,
            version: None,
        });
    };

    let version = update.version.clone();
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|error| format!("Failed to download update: {error}"))?;

    let mut prepared = prepared_update
        .update
        .lock()
        .map_err(|_| "Failed to lock prepared update state".to_string())?;
    *prepared = Some(PreparedAppUpdate {
        version: version.clone(),
        update,
        bytes,
    });

    Ok(AppUpdateResponse {
        status: AppUpdateStatus::Prepared,
        version: Some(version),
    })
}

#[tauri::command]
async fn install_prepared_app_update(
    app: AppHandle,
    prepared_update: State<'_, PreparedAppUpdateState>,
) -> Result<AppUpdateResponse, String> {
    let prepared = prepared_update
        .update
        .lock()
        .map_err(|_| "Failed to lock prepared update state".to_string())?
        .take()
        .ok_or_else(|| "No prepared update found. Check for updates again.".to_string())?;

    let version = prepared.version;
    let quarantine_target = app_quarantine_target()?;
    prepared
        .update
        .install(prepared.bytes)
        .map_err(|error| format!("Failed to install update: {error}"))?;

    clear_installed_app_quarantine(quarantine_target.as_deref())?;
    app.request_restart();

    Ok(AppUpdateResponse {
        status: AppUpdateStatus::Restarting,
        version: Some(version),
    })
}

#[cfg(target_os = "macos")]
fn app_quarantine_target() -> Result<Option<PathBuf>, String> {
    current_app_bundle_path().map(Some)
}

#[cfg(not(target_os = "macos"))]
fn app_quarantine_target() -> Result<Option<PathBuf>, String> {
    Ok(None)
}

#[cfg(target_os = "macos")]
fn clear_installed_app_quarantine(app_bundle: Option<&Path>) -> Result<(), String> {
    let app_bundle = app_bundle.ok_or_else(|| "Missing app bundle path".to_string())?;
    let output = std::process::Command::new("/usr/bin/xattr")
        .args(["-cr"])
        .arg(app_bundle)
        .output()
        .map_err(|error| format!("Failed to run xattr: {error}"))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(format!(
            "Failed to clear quarantine on `{}`: {}",
            app_bundle.display(),
            if stderr.is_empty() {
                "xattr exited without an error message".to_string()
            } else {
                stderr
            }
        ))
    }
}

#[cfg(not(target_os = "macos"))]
fn clear_installed_app_quarantine(_app_bundle: Option<&Path>) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
fn current_app_bundle_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    let macos_dir = exe
        .parent()
        .ok_or_else(|| format!("Could not find parent directory for `{}`", exe.display()))?;
    let contents_dir = macos_dir
        .parent()
        .ok_or_else(|| format!("Could not find Contents directory for `{}`", exe.display()))?;
    let app_bundle = contents_dir
        .parent()
        .ok_or_else(|| format!("Could not find app bundle for `{}`", exe.display()))?;

    Ok(app_bundle.to_path_buf())
}

fn resolve_input_or_resource(
    app: &AppHandle,
    input: Option<&str>,
    resource_path: &str,
    dev_path: &str,
) -> Result<PathBuf, String> {
    if let Some(value) = input.map(str::trim).filter(|value| !value.is_empty()) {
        let path = Path::new(value);
        if path.is_absolute() {
            return Ok(path.to_path_buf());
        }

        let repo_path = repo_root().join(path);
        if repo_path.exists() {
            return Ok(repo_path);
        }

        return std::env::current_dir()
            .map(|dir| dir.join(path))
            .map_err(|error| error.to_string());
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled_path = resource_dir.join(resource_path);
        if bundled_path.exists() {
            return Ok(bundled_path);
        }
    }

    let dev_path = repo_root().join(dev_path);
    if dev_path.exists() {
        return Ok(dev_path);
    }

    app.path()
        .resource_dir()
        .map(|dir| dir.join(resource_path))
        .map_err(|error| error.to_string())
}

fn resolve_output_path(app: &AppHandle, input: &str) -> Result<PathBuf, String> {
    let path = Path::new(input);
    if path.is_absolute() {
        return Ok(path.to_path_buf());
    }

    app.path()
        .app_data_dir()
        .map(|dir| dir.join(path))
        .map_err(|error| error.to_string())
}

fn create_temp_output_path(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("synthesis");
    fs::create_dir_all(&base_dir).map_err(|error| error.to_string())?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();

    Ok(base_dir.join(format!("speech-{}-{timestamp}.wav", std::process::id())))
}

fn create_saved_output_path(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("synthesis");
    fs::create_dir_all(&base_dir).map_err(|error| error.to_string())?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();

    Ok(base_dir.join(format!("speech-{}-{timestamp}.wav", std::process::id())))
}

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("repo root")
        .to_path_buf()
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn derive_tsv_path_from_wav(path: &Path) -> PathBuf {
    if let Some(stem) = path.file_stem().and_then(|value| value.to_str()) {
        let parent = path.parent().unwrap_or_else(|| Path::new(""));
        return parent.join(format!("{stem}.tsv"));
    }

    PathBuf::from(format!("{}.tsv", path.display()))
}

fn read_timestamps(path: &Path) -> Result<Vec<TimestampRow>, String> {
    let content = fs::read_to_string(path).map_err(|error| {
        format!(
            "Failed to read timestamp sidecar `{}`: {error}",
            path.display()
        )
    })?;
    let mut rows = Vec::new();

    for (line_index, line) in content.lines().enumerate().skip(1) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let mut columns = line.split('\t');
        let word = columns
            .next()
            .ok_or_else(|| format!("Malformed timestamp row {}", line_index + 1))?;
        let start_sec = columns
            .next()
            .ok_or_else(|| format!("Malformed timestamp row {}", line_index + 1))?
            .parse::<f32>()
            .map_err(|error| {
                format!("Invalid timestamp start on row {}: {error}", line_index + 1)
            })?;
        let end_sec = columns
            .next()
            .ok_or_else(|| format!("Malformed timestamp row {}", line_index + 1))?
            .parse::<f32>()
            .map_err(|error| format!("Invalid timestamp end on row {}: {error}", line_index + 1))?;

        rows.push(TimestampRow {
            word: word.to_string(),
            start_sec,
            end_sec,
        });
    }

    Ok(rows)
}

fn format_command_failure(output: &Output) -> String {
    let code = output
        .status
        .code()
        .map_or_else(|| "unknown".to_string(), |code| code.to_string());
    format!("koko exited with code {code}. {}", command_log(output))
}

fn command_log(output: &Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    match (stdout.is_empty(), stderr.is_empty()) {
        (true, true) => "No output was captured from koko.".to_string(),
        (false, true) => format!("stdout: {stdout}"),
        (true, false) => format!("stderr: {stderr}"),
        (false, false) => format!("stdout: {stdout}; stderr: {stderr}"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PreparedAppUpdateState::default())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            synthesize_speech,
            list_saved_audio,
            prepare_app_update,
            install_prepared_app_update
        ])
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
