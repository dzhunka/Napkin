import { useId } from "react";

export function Mark({ className }: { className?: string }) {
  const gesture = useId();

  return (
    <svg
      viewBox="72 76 476 268"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <mask id={gesture} maskUnits="userSpaceOnUse" x="72" y="76" width="476" height="268">
        <rect x="72" y="76" width="476" height="268" fill="white" />
        <path
          fill="none"
          stroke="black"
          strokeWidth="18"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M132 244C160 254 192 254 220 244C200 228 196 204 207 182C220 156 252 145 277 155C302 165 310 190 298 213C285 237 257 247 220 244C248 268 307 268 336 244C318 228 318 205 331 187C346 165 376 161 396 176C417 192 413 217 395 233C379 247 358 248 336 244C360 264 399 258 430 238C463 216 486 184 505 146"
        />
      </mask>
      <path
        mask={`url(#${gesture})`}
        d="M116 92H504Q532 92 532 120V198C532 270 474 328 402 328H116Q88 328 88 300V120Q88 92 116 92Z"
      />
    </svg>
  );
}
