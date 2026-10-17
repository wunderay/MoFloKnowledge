/**
 * How long the view waits on the server after a save, in milliseconds. (An object so that a test can shorten them.)
 *  - reread: the longest the draft read that follows a save may take; past it the save still stands but the view is stale.
 *  - reload: the longest a Reload the person asked for may take; much longer than a save's read, but not for ever.
 *  - fresh: the longest a save waits for the view to show the revision it wrote before the saves behind it stop.
 */
export const timing = { reread: 8000, reload: 60000, fresh: 12000 };
