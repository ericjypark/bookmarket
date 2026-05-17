/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** API Base URL - Use the API origin or /api/v1 root. Local example: http://localhost:8080 */
  "apiBaseUrl": string,
  /** API Token - Bookmarket API token with bookmarks:read for search and bookmarks:write for adding bookmarks. */
  "apiToken": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `search-bookmarks` command */
  export type SearchBookmarks = ExtensionPreferences & {}
  /** Preferences accessible in the `add-bookmark` command */
  export type AddBookmark = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `search-bookmarks` command */
  export type SearchBookmarks = {}
  /** Arguments passed to the `add-bookmark` command */
  export type AddBookmark = {}
}

