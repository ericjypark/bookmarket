import {
  Action,
  ActionPanel,
  Form,
  Toast,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import {
  Category,
  createBookmark,
  displayTitle,
  listCategories,
  userFacingError,
} from "./api/client";

type FormValues = {
  url: string;
  categoryName: string;
};

export default function AddBookmarkCommand() {
  const { pop } = useNavigation();
  const [isLoading, setIsLoading] = useState(false);
  const [isCategoriesLoading, setIsCategoriesLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [urlError, setUrlError] = useState<string>();

  useEffect(() => {
    const abortController = new AbortController();
    setIsCategoriesLoading(true);

    listCategories(abortController.signal)
      .then(setCategories)
      .catch((error: unknown) => {
        if (abortController.signal.aborted) return;

        void showToast({
          style: Toast.Style.Failure,
          title: "Could not load categories",
          message: userFacingError(error),
        });
      })
      .finally(() => {
        if (!abortController.signal.aborted) setIsCategoriesLoading(false);
      });

    return () => abortController.abort();
  }, []);

  const handleSubmit = async (values: FormValues) => {
    let normalizedUrl: string;

    try {
      normalizedUrl = normalizeHttpUrl(values.url);
      setUrlError(undefined);
    } catch (error) {
      const message = userFacingError(error);
      setUrlError(message);
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid URL",
        message,
      });
      return;
    }

    setIsLoading(true);

    try {
      const bookmark = await createBookmark({
        url: normalizedUrl,
        categoryName: values.categoryName?.trim() || undefined,
      });

      await showToast({
        style: Toast.Style.Success,
        title: "Bookmark added",
        message: displayTitle(bookmark),
      });
      pop();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not add bookmark",
        message: userFacingError(error),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form
      isLoading={isLoading || isCategoriesLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Add Bookmark" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="url"
        title="URL"
        placeholder="https://example.com"
        error={urlError}
        onChange={() => setUrlError(undefined)}
        autoFocus
      />
      <Form.Dropdown id="categoryName" title="Category" defaultValue="">
        <Form.Dropdown.Item value="" title="No Category" />
        {categories.map((category) => (
          <Form.Dropdown.Item
            key={category.id}
            value={category.name}
            title={category.name}
          />
        ))}
      </Form.Dropdown>
    </Form>
  );
}

const normalizeHttpUrl = (value: string) => {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    throw new Error("Enter a URL.");
  }

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`;
  const url = new URL(withProtocol);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Bookmarket supports HTTP and HTTPS URLs.");
  }

  return url.toString();
};
