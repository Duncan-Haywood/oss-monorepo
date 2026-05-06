use std::path::PathBuf;

use photo_editing::{
    build_ingest_plan, IngestFile, IngestOperationKind, IngestPlanOptions, MediaKind,
};

fn path(value: &str) -> PathBuf {
    PathBuf::from(value)
}

#[test]
fn classifies_raw_jpeg_video_and_sidecar_files_case_insensitively() {
    assert_eq!(MediaKind::from_path("A7IV_0001.ARW"), MediaKind::RawPhoto);
    assert_eq!(MediaKind::from_path("A7IV_0001.jpeg"), MediaKind::JpegPhoto);
    assert_eq!(MediaKind::from_path("A7IV_0002.MP4"), MediaKind::Video);
    assert_eq!(MediaKind::from_path("A7IV_0002.xmp"), MediaKind::Sidecar);
    assert_eq!(MediaKind::from_path("notes.txt"), MediaKind::Other);
}

#[test]
fn builds_copy_and_verify_plan_without_delete_operations() {
    let source_root = path("/Volumes/SDCARD/DCIM");
    let destination_root = path("/Volumes/WORKSSD/MediaLibrary");
    let plan = build_ingest_plan(
        &[
            IngestFile::new(path("/Volumes/SDCARD/DCIM/100MSDCF/A7IV_0001.ARW"), 42),
            IngestFile::new(path("/Volumes/SDCARD/DCIM/100MSDCF/A7IV_0001.JPG"), 20),
            IngestFile::new(
                path("/Volumes/SDCARD/DCIM/PRIVATE/M4ROOT/CLIP/C0001.MP4"),
                99,
            ),
        ],
        &IngestPlanOptions::new(source_root, destination_root, "2026-05-06-client-shoot"),
    )
    .expect("plan should be valid");

    assert_eq!(plan.operations.len(), 3);
    assert!(plan
        .operations
        .iter()
        .all(|operation| operation.kind == IngestOperationKind::CopyThenVerify));
    assert_eq!(plan.delete_operations, 0);
    assert_eq!(
        plan.operations[0].destination,
        path("/Volumes/WORKSSD/MediaLibrary/2026-05-06-client-shoot/raw/100MSDCF/A7IV_0001.ARW")
    );
    assert_eq!(
        plan.operations[1].destination,
        path("/Volumes/WORKSSD/MediaLibrary/2026-05-06-client-shoot/jpeg/100MSDCF/A7IV_0001.JPG")
    );
    assert_eq!(
        plan.operations[2].destination,
        path("/Volumes/WORKSSD/MediaLibrary/2026-05-06-client-shoot/video/PRIVATE/M4ROOT/CLIP/C0001.MP4")
    );
}

#[test]
fn rejects_files_outside_source_root_before_planning_copy_operations() {
    let result = build_ingest_plan(
        &[IngestFile::new(path("/Users/me/Desktop/random.mov"), 100)],
        &IngestPlanOptions::new(
            path("/Volumes/SDCARD/DCIM"),
            path("/Volumes/WORKSSD/MediaLibrary"),
            "2026-05-06-client-shoot",
        ),
    );

    let error = result.expect_err("outside source root should be rejected");
    assert!(error
        .to_string()
        .contains("is not inside source root /Volumes/SDCARD/DCIM"));
}

#[test]
fn rejects_colliding_destination_paths_instead_of_overwriting() {
    let result = build_ingest_plan(
        &[
            IngestFile::new(path("/Volumes/SDCARD/DCIM/A/B/../IMG_0001.CR3"), 100),
            IngestFile::new(path("/Volumes/SDCARD/DCIM/A/IMG_0001.CR3"), 100),
        ],
        &IngestPlanOptions::new(
            path("/Volumes/SDCARD/DCIM"),
            path("/Volumes/WORKSSD/MediaLibrary"),
            "2026-05-06-client-shoot",
        ),
    );

    let error = result.expect_err("collisions should block ingest");
    assert!(error
        .to_string()
        .contains("multiple source files map to destination"));
}

#[test]
fn rejects_shoot_slugs_that_are_not_single_safe_path_components() {
    for shoot_slug in ["../escaped", "/tmp/escaped", ".", "..", "client/shoot"] {
        let result = build_ingest_plan(
            &[IngestFile::new(
                path("/Volumes/SDCARD/DCIM/100MSDCF/A7IV_0001.ARW"),
                42,
            )],
            &IngestPlanOptions::new(
                path("/Volumes/SDCARD/DCIM"),
                path("/Volumes/WORKSSD/MediaLibrary"),
                shoot_slug,
            ),
        );

        let error = result.expect_err("unsafe shoot slug should be rejected");
        assert!(
            error
                .to_string()
                .contains("shoot slug must be a single safe path component"),
            "unexpected error for {shoot_slug}: {error}"
        );
    }
}

#[test]
fn rejects_reserved_destination_paths_to_prevent_overwriting_existing_media() {
    let result = build_ingest_plan(
        &[IngestFile::new(
            path("/Volumes/SDCARD/DCIM/100MSDCF/A7IV_0001.ARW"),
            42,
        )],
        &IngestPlanOptions::new(
            path("/Volumes/SDCARD/DCIM"),
            path("/Volumes/WORKSSD/MediaLibrary"),
            "2026-05-06-client-shoot",
        )
        .with_reserved_destinations([path(
            "/Volumes/WORKSSD/MediaLibrary/2026-05-06-client-shoot/raw/100MSDCF/A7IV_0001.ARW",
        )]),
    );

    let error = result.expect_err("existing destination should block ingest");
    assert!(error
        .to_string()
        .contains("destination is already reserved or exists"));
}

#[test]
fn rejects_relative_source_or_destination_paths() {
    let result = build_ingest_plan(
        &[IngestFile::new(path("DCIM/100MSDCF/A7IV_0001.ARW"), 42)],
        &IngestPlanOptions::new(
            path("/Volumes/SDCARD/DCIM"),
            path("/Volumes/WORKSSD/MediaLibrary"),
            "2026-05-06-client-shoot",
        ),
    );

    let error = result.expect_err("relative source file should be rejected");
    assert!(error.to_string().contains("path must be absolute"));
}

#[test]
fn rejects_relative_reserved_destination_paths() {
    let result = build_ingest_plan(
        &[IngestFile::new(
            path("/Volumes/SDCARD/DCIM/100MSDCF/A7IV_0001.ARW"),
            42,
        )],
        &IngestPlanOptions::new(
            path("/Volumes/SDCARD/DCIM"),
            path("/Volumes/WORKSSD/MediaLibrary"),
            "2026-05-06-client-shoot",
        )
        .with_reserved_destinations([path("2026-05-06-client-shoot/raw/100MSDCF/A7IV_0001.ARW")]),
    );

    let error = result.expect_err("relative reserved destination should be rejected");
    assert!(error.to_string().contains("path must be absolute"));
}
