export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center py-16 text-[12px] text-faint text-center">
      {children}
    </div>
  );
}
