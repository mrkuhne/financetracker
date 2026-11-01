import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Icon } from './Icons';

/** Prototype header (.hdr) + padded body. Placeholder screens use it until later tasks fill them. */
export function Screen({ title, back, big, right, children }: { title: string; back?: string; big?: boolean; right?: ReactNode; children?: ReactNode }) {
  return (
    <>
      <div className={`hdr${big ? ' big' : ''}`}>
        {!big && (
          <div className="side">
            {back && (
              <Link to={back} className="ib soft" aria-label="Back">
                <Icon name="back" />
              </Link>
            )}
          </div>
        )}
        <h1>{title}</h1>
        <div className="side">{right}</div>
      </div>
      <div className="pad">{children}</div>
    </>
  );
}
