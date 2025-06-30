# Offline mode

The purpose of this feature is to make some articles available to read even when the frontend
application is disconnected from the internet and unable to reach the backend server.

## Requirements

- Every article in an article list should have a "download" button immediately to the left of the
  "archive" button.
- Clicking the download button should cause the article data to be stored in browser local storage
  if it is not already there, and to be removed from browser local storage if it is there.
- The download button should have an appropriate icon, which should be drawn in black if the article
  data is in local storage and gray if it is not.
- When the application goes to render an article for reading, if the article data is in local
  storage it should use the local copy for rendering and not query the backend.
- When the application is disconnected from the internet:
    - The "Recent" tab in the UI should list only those articles available in the local storage. It
      should not attempt to query the backend in this case.
    - All other tabs in the UI should be disabled.

## Restrictions

- DO NOT attempt to represent the downloaded state on the backend. This feature should be
  implementable without any change to the backend APIs.
