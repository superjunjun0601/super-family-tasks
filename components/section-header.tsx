type SectionHeaderProps = {
  title: string;
  count?: number;
};

export function SectionHeader({ title, count }: SectionHeaderProps) {
  return (
    <div className="mb-2.5 mt-5 flex items-center justify-between">
      <h2 className="text-[17px] font-bold tracking-normal">{title}</h2>
      {typeof count === "number" ? (
        <span className="text-[13px] text-[var(--muted)]">{count} 项</span>
      ) : null}
    </div>
  );
}
