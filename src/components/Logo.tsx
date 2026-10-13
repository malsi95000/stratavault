import type { SVGProps } from "react";

export default function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 700 560" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      <g fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round">
        <line x1="350" y1="290" x2="410" y2="62" />
        <polyline points="380,87 412,60 440,97" />
        <line x1="350" y1="290" x2="520" y2="37" strokeDasharray="2 24" />
        <polyline points="495,57 522,34 535,72" />
        <line x1="350" y1="290" x2="167" y2="142" />
        <polyline points="152,177 165,140 204,152" />
        <line x1="350" y1="290" x2="92" y2="272" />
        <line x1="350" y1="290" x2="62" y2="322" />
        <line x1="350" y1="290" x2="190" y2="368" />
        <line x1="350" y1="290" x2="495" y2="272" />
        <line x1="350" y1="290" x2="350" y2="458" />
        <line x1="350" y1="290" x2="380" y2="500" />
        <line x1="350" y1="290" x2="545" y2="430" />
        <polyline points="518,410 548,433 528,462" />
      </g>
      <g fill="currentColor">
        <rect x="341" y="281" width="18" height="18" rx="2" />
        <rect x="78" y="263" width="18" height="18" rx="2" />
        <rect x="48" y="313" width="16" height="16" rx="2" />
        <circle cx="350" cy="458" r="7" />
        <circle cx="380" cy="505" r="16" />
      </g>
      <g stroke="currentColor" strokeWidth="10" strokeLinecap="round">
        <line x1="178" y1="356" x2="202" y2="380" />
        <line x1="202" y1="356" x2="178" y2="380" />
        <line x1="483" y1="260" x2="507" y2="284" />
        <line x1="507" y1="260" x2="483" y2="284" />
      </g>
    </svg>
  );
}
