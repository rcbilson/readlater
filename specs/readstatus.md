# unread and lastAccess

Currently the article unread status and lastAccess time are updated in the backend whenever the
`summarize` API is called. This means that they are updated when an article is downloaded for
offline reading, which is incorrect.

Fix this in the following way:
- Change the implementation of the `summarize` API so that it does not affect the unread status or
  lastAccess time.
- Add a separate `markRead` API that updates unread status and lastAccess time.
- When an article is rendered for reading call the `markRead` API to update the article status.
