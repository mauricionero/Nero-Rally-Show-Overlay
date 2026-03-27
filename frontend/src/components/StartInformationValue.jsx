import React from 'react';

const SIGNAL_COLORS = {
  red: {
    active: '#EF4444',
    inactive: 'rgba(239, 68, 68, 0.18)'
  },
  green: {
    active: '#22C55E',
    inactive: 'rgba(34, 197, 94, 0.18)'
  }
};

const StartSignalDots = React.memo(({ signal }) => {
  if (!signal?.mode) return null;

  const palette = SIGNAL_COLORS[signal.mode] || SIGNAL_COLORS.red;
  const totalCount = signal.totalCount || 5;
  const activeCount = Math.max(0, Math.min(signal.activeCount || 0, totalCount));

  return (
    <span className="inline-flex items-center gap-[0.08em] leading-none align-middle" aria-hidden="true">
      {Array.from({ length: totalCount }, (_, index) => {
        const isActive = index < activeCount;
        return (
          <span
            key={`${signal.mode}-${index}`}
            className="inline-block rounded-full"
            style={{
              width: '0.66em',
              height: '0.66em',
              backgroundColor: isActive ? palette.active : palette.inactive,
              boxShadow: isActive ? `0 0 0.35em ${palette.active}` : 'none'
            }}
          />
        );
      })}
    </span>
  );
});

function StartInformationValueBase({ info, fallback = '', className = '', style, as: Component = 'span' }) {
  const content = info?.signal
    ? (
        <>
          {info.label ? `${info.label}: ` : ''}
          <StartSignalDots signal={info.signal} />
          {info.signal.mode === 'green' && Number.isFinite(info.signal.seconds) && (
            <span className="ml-2">{info.signal.seconds}</span>
          )}
        </>
      )
    : (fallback || info?.text || '');

  if (!content) {
    return null;
  }

  return (
    <Component className={className} style={style}>
      {content}
    </Component>
  );
}

const shallowEqual = (left = {}, right = {}) => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
};

const isSameSignal = (leftSignal, rightSignal) => (
  leftSignal?.mode === rightSignal?.mode &&
  Number(leftSignal?.activeCount || 0) === Number(rightSignal?.activeCount || 0) &&
  Number(leftSignal?.totalCount || 0) === Number(rightSignal?.totalCount || 0) &&
  Number(leftSignal?.seconds || 0) === Number(rightSignal?.seconds || 0)
);

const areStartInformationPropsEqual = (prevProps, nextProps) => (
  prevProps.as === nextProps.as &&
  prevProps.className === nextProps.className &&
  prevProps.fallback === nextProps.fallback &&
  prevProps.info?.text === nextProps.info?.text &&
  prevProps.info?.label === nextProps.info?.label &&
  isSameSignal(prevProps.info?.signal, nextProps.info?.signal) &&
  shallowEqual(prevProps.style, nextProps.style)
);

export const StartInformationValue = React.memo(StartInformationValueBase, areStartInformationPropsEqual);
