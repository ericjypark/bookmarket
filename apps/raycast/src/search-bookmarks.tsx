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
  filterCachedBookmarks,
  listBookmarks,
  readCachedBookmarkList,
  searchBookmarks,
  userFacingError,
  writeCachedBookmarkList,
} from "./api/client";

const searchDebounceMs = 250;

export default function SearchBookmarksCommand() {
  const [searchText, setSearchText] = useState("");
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const query = useMemo(() => searchText.trim(), [searchText]);

  useEffect(() => {
    const abortController = new AbortController();
    const cachedBookmarks = readCachedBookmarkList();

    if (cachedBookmarks) {
      setBookmarks(
        query ? filterCachedBookmarks(cachedBookmarks, query) : cachedBookmarks,
      );
    }

    const loadBookmarks = () => {
      setIsLoading(true);
      setError(null);

      const request = query
        ? searchBookmarks(query, abortController.signal)
        : listBookmarks(abortController.signal);

      request
        .then((nextBookmarks) => {
          setBookmarks(nextBookmarks);
          if (!query) writeCachedBookmarkList(nextBookmarks);
        })
        .catch((nextError: unknown) => {
          if (!abortController.signal.aborted) setError(nextError);
        })
        .finally(() => {
          if (!abortController.signal.aborted) setIsLoading(false);
        });
    };

    const timeout = query
      ? setTimeout(loadBookmarks, searchDebounceMs)
      : undefined;
    if (!query) loadBookmarks();

    return () => {
      if (timeout) clearTimeout(timeout);
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
    : "No Bookmarket bookmarks yet";
  const emptyDescription = query
    ? "Try another title or URL."
    : "Use Add Bookmark to save your first link.";

  return (
    <List
      isLoading={isLoading}
      filtering={false}
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
