import { Link } from 'react-router-dom'

type Section = {
  title: string
  paragraphs: string[]
}

type Props = {
  title: string
  lastUpdated: string
  sections: Section[]
}

export default function LegalPage({ title, lastUpdated, sections }: Props) {
  return (
    <div className="legal-page">
      <div className="legal-card">
        <h1>{title}</h1>
        <p className="legal-updated">Last updated: {lastUpdated}</p>
        {sections.map((section) => (
          <section key={section.title} className="legal-section">
            <h2>{section.title}</h2>
            {section.paragraphs.map((p, i) => (
              <p key={`${section.title}-${i}`}>{p}</p>
            ))}
          </section>
        ))}
        <div className="legal-links">
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/license">License</Link>
          <Link to="/login">Back to login</Link>
        </div>
      </div>
      <style>{styles}</style>
    </div>
  )
}

const styles = `
  .legal-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  .legal-card {
    width: 100%;
    max-width: 760px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.5rem;
  }
  .legal-card h1 {
    margin: 0 0 0.25rem;
    font-size: 1.6rem;
  }
  .legal-updated {
    margin: 0 0 1rem;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
  .legal-section {
    margin-top: 1rem;
  }
  .legal-section h2 {
    margin: 0 0 0.4rem;
    font-size: 1.05rem;
  }
  .legal-section p {
    margin: 0.4rem 0;
    color: var(--text);
    line-height: 1.5;
  }
  .legal-links {
    margin-top: 1.25rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .legal-links a {
    color: var(--text-muted);
    text-decoration: none;
    font-size: 0.9rem;
  }
  .legal-links a:hover {
    color: var(--accent);
  }
`
