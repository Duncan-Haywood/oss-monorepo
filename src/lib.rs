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
            Some("arw" | "cr2" | "cr3" | "dng" | "nef" | "orf" | "raf" | "rw2") => Self::RawPhoto,
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
    pub reserved_destinations: Vec<PathBuf>,
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
            reserved_destinations: Vec::new(),
        }
    }

    pub fn with_reserved_destinations(
        mut self,
        reserved_destinations: impl IntoIterator<Item = PathBuf>,
    ) -> Self {
        self.reserved_destinations = reserved_destinations.into_iter().collect();
        self
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
    UnsafeShootSlug {
        shoot_slug: String,
    },
    PathMustBeAbsolute {
        path: PathBuf,
    },
    FileOutsideSourceRoot {
        source: PathBuf,
        source_root: PathBuf,
    },
    DestinationCollision {
        destination: PathBuf,
    },
    ReservedDestination {
        destination: PathBuf,
    },
}

impl Display for IngestPlanError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::EmptyShootSlug => write!(formatter, "shoot slug cannot be empty"),
            Self::UnsafeShootSlug { shoot_slug } => write!(
                formatter,
                "shoot slug must be a single safe path component: {}",
                shoot_slug
            ),
            Self::PathMustBeAbsolute { path } => {
                write!(formatter, "path must be absolute: {}", path.display())
            }
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
            Self::ReservedDestination { destination } => write!(
                formatter,
                "destination is already reserved or exists: {}",
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
    if !is_safe_slug(&options.shoot_slug) {
        return Err(IngestPlanError::UnsafeShootSlug {
            shoot_slug: options.shoot_slug.clone(),
        });
    }

    validate_absolute(&options.source_root)?;
    validate_absolute(&options.destination_root)?;

    let source_root = normalize_lexically(&options.source_root);
    let destination_root = normalize_lexically(&options.destination_root);
    let mut reserved_destinations = HashSet::with_capacity(options.reserved_destinations.len());
    for reserved_destination in &options.reserved_destinations {
        validate_absolute(reserved_destination)?;
        reserved_destinations.insert(normalize_lexically(reserved_destination));
    }
    let mut planned_destinations = HashSet::new();
    let mut operations = Vec::with_capacity(files.len());

    for file in files {
        validate_absolute(&file.source)?;
        let normalized_source = normalize_lexically(&file.source);
        let relative_source = normalized_source.strip_prefix(&source_root).map_err(|_| {
            IngestPlanError::FileOutsideSourceRoot {
                source: normalized_source.clone(),
                source_root: source_root.clone(),
            }
        })?;
        let media_kind = MediaKind::from_path(&normalized_source);
        let destination = destination_root
            .join(&options.shoot_slug)
            .join(media_kind.library_bucket())
            .join(relative_source);
        let normalized_destination = normalize_lexically(destination);

        if reserved_destinations.contains(&normalized_destination) {
            return Err(IngestPlanError::ReservedDestination {
                destination: normalized_destination,
            });
        }

        if !planned_destinations.insert(normalized_destination.clone()) {
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

fn validate_absolute(path: &Path) -> Result<(), IngestPlanError> {
    if path.is_absolute() {
        Ok(())
    } else {
        Err(IngestPlanError::PathMustBeAbsolute {
            path: path.to_path_buf(),
        })
    }
}

fn is_safe_slug(shoot_slug: &str) -> bool {
    let mut components = Path::new(shoot_slug).components();

    matches!(components.next(), Some(Component::Normal(_))) && components.next().is_none()
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
