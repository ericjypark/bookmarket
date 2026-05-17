# Bookmarket

Bookmarket is a modern web application for managing and organizing your bookmarks. Built with Next.js, TypeScript, and leveraging cutting-edge technologies, Bookmarket offers a seamless and intuitive bookmarking experience.

## Diagram
<img width="1527" alt="image" src="https://github.com/user-attachments/assets/636e1398-cf05-4b06-a9f2-97420479c18c" />


## Features

- ✅ User Authentication (Clerk)
- ✅ Database Integration (Neon, Drizzle)
- ✅ CI/CD Pipeline (Vercel)
- ✅ URL Metadata Fetching
- ✅ Bookmark Management (Add, List, Delete)
- ✅ Link Preview
- ✅ Sticky Header
- ✅ Context Menu for Bookmarks
- ✅ Animated Vanishing Input for URL Entry
- ✅ Bookmark Editing

## Upcoming Features

- [ ] Bookmark Categories
- [ ] Landing Page
- [ ] Loading Skeletons for Metadata Fetching

## Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- Drizzle ORM
- Clerk Authentication
- Tanstack Query (React Query)
- Framer Motion
- Radix UI

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```
   pnpm install
   ```
3. Set up environment variables (see `.env.example`)
4. Start the development server:
   ```
   pnpm dev
   ```

## Project Structure

- `/src/app`: Next.js app router structure
- `/src/server`: Server-side code and database queries
- `/src/styles`: Global styles and Tailwind configuration
- `/src/types`: TypeScript type definitions
- `/src/app/_core`: Core components and utilities
- `/src/app/_common`: Common components and providers

## API Routes

- `/api/bookmarks`: CRUD operations for bookmarks
- `/api/metadata`: Fetches metadata for given URLs

## Styling

This project uses Tailwind CSS for styling. Custom styles and theme configurations can be found in:

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT License](LICENSE)
