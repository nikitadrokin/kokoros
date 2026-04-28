use ort::ep;
use ort::logging::LogLevel;
use ort::session::Session;
use ort::session::builder::SessionBuilder;

pub trait OrtBase {
    fn load_model(&mut self, model_path: String) -> Result<(), String> {
        #[cfg(feature = "coreml")]
        let providers = [ep::CoreML::default()
            .with_compute_units(ep::coreml::ComputeUnits::All)
            .with_model_cache_dir(
                std::env::var("HOME")
                    .map(|h| format!("{}/Library/Caches/kokoros/coreml", h))
                    .unwrap_or_else(|_| {
                        std::env::temp_dir().to_string_lossy().into_owned()
                    }),
            )
            .build()];

        #[cfg(all(feature = "cuda", not(feature = "coreml")))]
        let providers = [ep::CUDA::default().build()];

        #[cfg(not(any(feature = "cuda", feature = "coreml")))]
        let providers = [ep::CPU::default().build()];

        match SessionBuilder::new() {
            Ok(builder) => {
                let session = builder
                    .with_execution_providers(providers)
                    .map_err(|e| format!("Failed to build session: {}", e))?
                    .with_log_level(LogLevel::Warning)
                    .map_err(|e| format!("Failed to set log level: {}", e))?
                    .commit_from_file(model_path)
                    .map_err(|e| format!("Failed to commit from file: {}", e))?;
                self.set_sess(session);
                Ok(())
            }
            Err(e) => Err(format!("Failed to create session builder: {}", e)),
        }
    }

    fn print_info(&self) {
        if let Some(session) = self.sess() {
            eprintln!("Input names:");
            for input in session.inputs() {
                eprintln!("  - {}", input.name());
            }
            eprintln!("Output names:");
            for output in session.outputs() {
                eprintln!("  - {}", output.name());
            }

            #[cfg(feature = "coreml")]
            eprintln!("Configured with: CoreML execution provider");

            #[cfg(all(feature = "cuda", not(feature = "coreml")))]
            eprintln!("Configured with: CUDA execution provider");

            #[cfg(not(any(feature = "cuda", feature = "coreml")))]
            eprintln!("Configured with: CPU execution provider");
        } else {
            eprintln!("Session is not initialized.");
        }
    }

    fn set_sess(&mut self, sess: Session);
    fn sess(&self) -> Option<&Session>;
}
