# Local Synchronization

The intent of this project is to replace the current provision for storing articles offline with a more comprehensive mechanism for reading and managing articles that works irrespective of whether the device is connected.

## Requirements

* The app must have a copy of all recent article contents and metadata in order to render the recent articles list and allow the user to read any recent articles.
* This data must stay synchronized with the corresponding data in the backend.
* When data changes in the app (e.g., the unread status changes) that data must eventually be synchronized to the backend.
* When data changes in the backend (e.g., a new article is added) that data must eventually be synchronized to the app.
* Search and adding new articles continue to operate directly on the backend using APIs.
* For the purposes of this project, the "recent" articles are any articles that have not been archived.
* It should be possible to archive a recent article without a backend connection, which removes it from the recent set.

## Changes vs. the current implementation

* It's no longer possible to explicitly mark an article for download. All recent articles are available for offline access.
* The recent page no longer has a separate offline mode; all operations work on local data first, and synchronization to the backend happens in the background.
