import styles from "./ErrorState.module.css";

type ErrorStateProps = {
  onRetry: () => void;
  className?: string;
};

export function ErrorState({ onRetry, className }: ErrorStateProps) {
  return (
    <div className={[styles.state, className].filter(Boolean).join(" ")} role="alert">
      <h2>暂时无法从该数据源获取结果。</h2>
      <button onClick={onRetry} type="button">
        重试
      </button>
    </div>
  );
}
