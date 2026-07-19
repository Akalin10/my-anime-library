import type { FormEvent, RefObject } from "react";

import styles from "./ExternalSearchInput.module.css";

type ExternalSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
};

export function ExternalSearchInput({
  value,
  onChange,
  onSearch,
  inputRef,
}: ExternalSearchInputProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch();
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} role="search">
      <label className={styles.field}>
        <span className={styles.label}>搜索外部动漫资料</span>
        <span className={styles.inputWrap}>
          <span className={styles.searchIcon} aria-hidden="true" />
          <input
            aria-label="搜索外部动漫资料"
            autoComplete="off"
            maxLength={200}
            onChange={(event) => onChange(event.target.value)}
            placeholder="输入动漫名称，例如：进击的巨人"
            ref={inputRef}
            type="search"
            value={value}
          />
        </span>
      </label>
      <button disabled={!value.trim()} type="submit">
        搜索
      </button>
    </form>
  );
}
