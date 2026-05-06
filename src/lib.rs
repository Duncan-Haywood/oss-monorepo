use std::collections::HashSet;
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::path::{Component, Path, PathBuf};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MediaKind {
    RawPhoto,
    JpegPhoto,
    Video,
    Sidecar,
    Other,
}

impl MediaKind {
    pub fn from_path(path: impl AsRef<Path>) -> Self {
        match path
            .as_ref()
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.to_ascii_lowercase())
            .as_deref()
        {
            Some("arw" | "cr2" | "cr3" | "dng" | "nef" | "orf" | "raf" | "rw2") => {
                Self::RawPhoto
            }
            Some("jpg" | "jpeg") => Self::JpegPhoto,
            Some("mov" | "mp4" | "m4v" | "avi" | "mxf") => Self::Video,
            Some("xmp" | "dop" | "cos") => Self::Sidecar,
            _ => Self::Other,
        }
    }

    fn library_bucket(&self) -> &'static str {
        match self {
            Self::RawPhoto => "raw",
            Self::JpegPhoto => "jpeg",
            Self::Video => "video",
            Self::Sidecar => "sidecar",
            Self::Other => "other",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IngestFile {
    pub source: PathBuf,
    pub byte_len: u64,
}

impl IngestFile {
    pub fn new(source: PathBuf, byte_len: u64) -> Self {
        Self { source, byte_len }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IngestPlanOptions {
    pub source_root: PathBuf,
    pub destination_root: PathBuf,
    pub shoot_slug: String,
}

impl IngestPlanOptions {
    pub fn new(
        source_root: PathBuf,
        destination_root: PathBuf,
        shoot_slug: impl Into<String>,
    ) -> Self {
        Self {
            source_root,
            destination_root,
            shoot_slug: shoot_slug.into(),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum IngestOperationKind {
    CopyThenVerify,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IngestOperation {
    pub kind: IngestOperationKind,
    pub source: PathBuf,
    pub destination: PathBuf,
    pub byte_len: u64,
    pub media_kind: MediaKind,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IngestPlan {
    pub operations: Vec<IngestOperation>,
    pub delete_operations: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum IngestPlanError {
    EmptyShootSlug,
    FileOutsideSourceRoot {
        source: PathBuf,
        source_root: PathBuf,
    },
    DestinationCollision {
        destination: PathBuf,
    },
}

impl Display for IngestPlanError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::EmptyShootSlug => write!(formatter, "shoot slug cannot be empty"),
            Self::FileOutsideSourceRoot {
                source,
                source_root,
            } => write!(
                formatter,
                "{} is not inside source root {}",
                source.display(),
                source_root.display()
            ),
            Self::DestinationCollision { destination } => write!(
                formatter,
                "multiple source files map to destination {}",
                destination.display()
            ),
        }
    }
}

impl Error for IngestPlanError {}

pub fn build_ingest_plan(
    files: &[IngestFile],
    options: &IngestPlanOptions,
) -> Result<IngestPlan, IngestPlanError> {
    if options.shoot_slug.trim().is_empty() {
        return Err(IngestPlanError::EmptyShootSlug);
    }

    let source_root = normalize_lexically(&options.source_root);
    let destination_root = normalize_lexically(&options.destination_root);
    let mut destinations = HashSet::new();
    let mut operations = Vec::with_capacity(files.len());

    for file in files {
        let normalized_source = normalize_lexically(&file.source);
        let relative_source =
            normalized_source
                .strip_prefix(&source_root)
                .map_err(|_| IngestPlanError::FileOutsideSourceRoot {
                    source: normalized_source.clone(),
                    source_root: source_root.clone(),
                })?;
        let media_kind = MediaKind::from_path(&normalized_source);
        let destination = destination_root
            .join(&options.shoot_slug)
            .join(media_kind.library_bucket())
            .join(relative_source);
        let normalized_destination = normalize_lexically(destination);

        if !destinations.insert(normalized_destination.clone()) {
            return Err(IngestPlanError::DestinationCollision {
                destination: normalized_destination,
            });
        }

        operations.push(IngestOperation {
            kind: IngestOperationKind::CopyThenVerify,
            source: normalized_source,
            destination: normalized_destination,
            byte_len: file.byte_len,
            media_kind,
        });
    }

    Ok(IngestPlan {
        operations,
        delete_operations: 0,
    })
}

fn normalize_lexically(path: impl AsRef<Path>) -> PathBuf {
    let mut normalized = PathBuf::new();

    for component in path.as_ref().components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            Component::Prefix(prefix) => normalized.push(prefix.as_os_str()),
            Component::RootDir => normalized.push(component.as_os_str()),
            Component::Normal(value) => normalized.push(value),
        }
    }

    normalized
}

