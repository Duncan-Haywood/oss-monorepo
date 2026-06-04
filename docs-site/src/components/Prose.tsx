type ProseProps = {
  children: React.ReactNode;
};

export function Prose({ children }: ProseProps) {
  return <article className="prose">{children}</article>;
}
