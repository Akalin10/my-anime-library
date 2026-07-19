import styles from "./LocalSearchInput.module.css";

type LocalSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
};

export function LocalSearchInput({ value, onChange }: LocalSearchInputProps) {
  return (
    <label className={styles.search}>
      <span className={styles.icon} aria-hidden="true" />
      <span className={styles.srOnly}>搜索本地动漫库</span>
      <input
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        placeholder="搜索动漫名称……"
        type="search"
        value={value}
      />
    </label>
  );
}
