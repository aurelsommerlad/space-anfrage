import styles from "./SiteChrome.module.css";

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <p className={styles.mark}>
          <span className={styles.name}>SPACE im HØV</span>
          <span className={styles.place}>Altusried</span>
        </p>
        <p className={styles.operator}>UNIQUE PLACES</p>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <p>SPACE im HØV, Altusried · betrieben von UNIQUE PLACES</p>
      </div>
    </footer>
  );
}
