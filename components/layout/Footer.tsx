export function Footer() {
  return (
    <footer className="mt-auto border-t border-border-subtle">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-[13px] text-faint sm:flex-row sm:px-6">
        <span>© {new Date().getFullYear()} tst.dev</span>
        <span className="flex items-center gap-2">
          <a href="https://github.com/natedotid/tst.dev" className="transition-colors hover:text-foreground">
            Source code
          </a>
          <span aria-hidden className="text-faint">·</span>
          <a href="https://nate.id" className="transition-colors hover:text-foreground">
            Built by Nate
          </a>
        </span>
      </div>
    </footer>
  );
}
