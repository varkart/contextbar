#[derive(thiserror::Error, Debug)]
pub enum AppError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("mutex poisoned")]
    MutexPoisoned,

    #[error("{0}")]
    Other(String),
}
