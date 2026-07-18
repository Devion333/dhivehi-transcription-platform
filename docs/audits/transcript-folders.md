# Transcript Folders

Date: 2026-07-18

Branch: `feature/transcript-organization`

## Scope

Transcript folders let users group related transcripts into simple cases or working sets. This implementation does not add shared folders, nested folders, team permissions, bulk deletion, or transcript duplication.

## Database Schema

Migration: `backend/migrations/004_transcript_folders.sql`.

Tables:

| Table | Purpose |
| --- | --- |
| `transcript_folders` | Folder metadata: UUID `id`, `owner_user_id`, `name`, `description`, `created_at`, `updated_at`. |
| `transcript_folder_items` | One transcript membership per row: `folder_id`, `transcript_job_id`, `created_at`. |

Constraints and indexes:

| Constraint or index | Purpose |
| --- | --- |
| `owner_user_id REFERENCES users(id)` | Folders are owned by active application users. |
| `transcript_folders_owner_name_lower_idx` | Case-insensitive unique folder name per owner. |
| `UNIQUE (transcript_job_id)` | One-folder-per-transcript rule. |
| `transcript_folders_owner_updated_idx` | Efficient owner-scoped folder listing. |
| `transcript_folder_items_folder_idx` | Efficient folder detail lookup. |

Transcript content remains in Qdrant. PostgreSQL stores only folder metadata and transcript job IDs.

## APIs

Authenticated endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/folders?search=&ownerUserId=&page=&pageSize=` | List folders visible to the current user. `ownerUserId` is admin-only. |
| `POST` | `/api/folders` | Create a folder owned by the authenticated user. |
| `GET` | `/api/folders/:folderId` | Get folder metadata and transcripts in the folder. |
| `PATCH` | `/api/folders/:folderId` | Rename/update description. |
| `DELETE` | `/api/folders/:folderId` | Delete an empty folder only. |
| `POST` | `/api/folders/:folderId/transcripts` | Add an authorized transcript to the folder. |
| `DELETE` | `/api/folders/:folderId/transcripts/:jobId` | Remove a transcript from the folder. |

Folder creation/update validation trims values, requires `name`, limits name to 120 characters, limits description to 500 characters, rejects control characters, and rejects unknown JSON fields through the existing strict decoder.

Suggested error codes implemented:

| Code | Meaning |
| --- | --- |
| `FOLDER_NOT_FOUND` | Folder does not exist or is inaccessible. |
| `FOLDER_NAME_REQUIRED` | Folder name is empty after trimming. |
| `FOLDER_NAME_EXISTS` | Owner already has a folder with the same case-insensitive name. |
| `FOLDER_NOT_EMPTY` | Delete attempted while folder has transcripts. |
| `TRANSCRIPT_ALREADY_IN_FOLDER` | Transcript already belongs to a folder. |
| `TRANSCRIPT_NOT_IN_FOLDER` | Removal requested for a transcript not in that folder. |

## Authorization

Standard users can create, view, rename, delete, and manage only their own folders. They can add only transcripts they own because membership creation uses existing transcript ownership authorization.

Administrators can view and manage all folders and can add any accessible transcript, including ownerless legacy transcripts.

Backend checks are authoritative. Frontend role-based navigation is only a usability layer.

## Reassignment Behavior

When an administrator reassigns a transcript, existing folder membership is removed after the transcript owner payload is updated. The old folder is not transferred to the new owner. Transcript reassignment notifications remain unchanged.

This prevents stale membership in the previous owner's folder while leaving transcript content intact.

## Delete-Empty-Only Behavior

Folders can be deleted only when they contain no transcripts. Deleting a folder never deletes transcript Qdrant parent points, segment points, MinIO objects, queues, or analysis data.

The frontend details page disables final deletion until the folder is empty and shows a clear message requiring transcripts to be removed or moved first.

## Transcript And Search Integration

Transcript summaries and details now include safe folder metadata:

| Field | Meaning |
| --- | --- |
| `folderId` | Folder UUID visible to the current user. Empty when no accessible folder exists. |
| `folderName` | Folder name visible to the current user. Empty when no accessible folder exists. |

Filtering support:

| Endpoint | Parameter |
| --- | --- |
| `GET /api/transcripts` | `folderId` |
| `GET /api/search/transcripts` | `folderId` |

Folder access is verified before applying the filter. Search results include folder names where applicable.

## Frontend Pages

| Route | Behavior |
| --- | --- |
| `/Folders` | Search, create folder, list visible folders with count, owner for admins, updated date, and open action. |
| `/Folders/Details?folder_id=<folderId>` | Shows folder metadata, transcripts inside the folder, add transcript, remove transcript, rename folder, and delete empty folder. |

`Folders` is linked from the main navigation. Transcript list and search include folder filters. Transcript Details includes compact add/move/remove folder controls.

## Audit Behavior

Added audit actions:

| Action | Safe metadata |
| --- | --- |
| `folder_created` | `folderId` |
| `folder_updated` | `folderId` |
| `folder_deleted` | `folderId` |
| `transcript_added_to_folder` | `folderId`, `jobId` |
| `transcript_removed_from_folder` | `folderId`, `jobId` |
| `transcript_moved_between_folders` | `jobId`, `previousFolderId`, `newFolderId` |

Audit metadata intentionally excludes folder names, descriptions, transcript text, analysis text, owner email, and raw database errors.
