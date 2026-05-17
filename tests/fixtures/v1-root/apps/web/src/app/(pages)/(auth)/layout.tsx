export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className='mx-auto flex h-svh w-full max-w-2xl items-center justify-center'>{children}</main>
    </>
  );
}
