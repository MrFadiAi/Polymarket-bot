interface ConnectionStatusProps {
  connected: boolean;
  error: string | null;
}

export function ConnectionStatus({ connected, error }: ConnectionStatusProps) {
  if (connected && !error) return null;

  return (
    <div
      className={`px-6 py-3 text-center text-sm flex items-center justify-center gap-3 ${
        error
          ? 'bg-red-500/20 border-b border-red-500/30 text-red-400'
          : 'bg-yellow-500/20 border-b border-yellow-500/30 text-yellow-400'
      }`}
    >
      <div className={`w-2 h-2 rounded-full animate-pulse ${error ? 'bg-red-400' : 'bg-yellow-400'}`} />
      {error ? (
        <span>
          <span className="font-medium">Connection Error:</span> {error}
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Connecting to dashboard server...
        </span>
      )}
    </div>
  );
}
