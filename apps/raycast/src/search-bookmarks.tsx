import {
  Action,
  ActionPanel,
  Icon,
  List,
  Toast,
  showToast,
} from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  displayHost,
  displayTitle,
  searchBookmarks,
  userFacingError,
} from "./api/client";

const searchDebounceMs = 250;

export default function SearchBookmarksCommand() {
  const [searchText, setSearchText] = useState("");
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const query = useMemo(() => searchText.trim(), [searchText]);

  useEffect(() => {
    if (!query) {
      setBookmarks([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => {
      setIsLoading(true);
      setError(null);

      searchBookmarks(query, abortController.signal)
        .then(setBookmarks)
        .catch((nextError: unknown) => {
          if (!abortController.signal.aborted) setError(nextError);
        })
        .finally(() => {
          if (!abortController.signal.aborted) setIsLoading(false);
        });
    }, searchDebounceMs);

    return () => {
      clearTimeout(timeout);
      abortController.abort();
    };
  }, [query]);

  useEffect(() => {
    if (!error) return;

    void showToast({
      style: Toast.Style.Failure,
      title: "Search failed",
      message: userFacingError(error),
    });
  }, [error]);

  const emptyTitle = query
    ? "No Bookmarket bookmarks found"
    : "Search Bookmarket";
  const emptyDescription = query
    ? "Try another title or URL."
    : "Type a title, URL, or domain to search your bookmarks.";

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search titles, URLs, and domains..."
      onSearchTextChange={setSearchText}
    >
      {bookmarks.length === 0 ? (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title={emptyTitle}
          description={emptyDescription}
        />
      ) : (
        bookmarks.map((bookmark) => (
          <BookmarkListItem key={bookmark.id} bookmark={bookmark} />
        ))
      )}
    </List>
  );
}

function BookmarkListItem({ bookmark }: { bookmark: Bookmark }) {
  const title = displayTitle(bookmark);
  const host = displayHost(bookmark.url);
  const createdAt = new Date(bookmark.createdAt);
  const hasValidDate = !Number.isNaN(createdAt.getTime());

  return (
    <List.Item
      title={title}
      subtitle={host}
      icon={
        bookmark.faviconUrl
          ? { source: bookmark.faviconUrl, fallback: Icon.Link }
          : Icon.Link
      }
      accessories={[
        ...(bookmark.category
          ? [{ icon: Icon.Folder, text: bookmark.category.name }]
          : []),
        ...(bookmark.metadataStatus === "PENDING"
          ? [{ icon: Icon.Clock, text: "Indexing" }]
          : []),
        ...(hasValidDate ? [{ date: createdAt }] : []),
      ]}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser title="Open Bookmark" url={bookmark.url} />
          <Action.CopyToClipboard
            title="Copy URL"
            content={bookmark.url}
            shortcut={{ modifiers: ["cmd"], key: "." }}
          />
          <Action.CopyToClipboard
            title="Copy as Markdown"
            content={`[${title}](${bookmark.url})`}
            shortcut={{ modifiers: ["cmd", "shift"], key: "." }}
          />
        </ActionPanel>
      }
    />
  );
}
