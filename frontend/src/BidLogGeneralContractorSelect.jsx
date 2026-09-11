import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';


function normalizedKey(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase();
}


function optionSearchText(option) {
  return [
    option?.name,
    option?.cityStateZip,
    option?.email,
    option?.phoneNumber,
    option?.streetAddress,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
}


export default function BidLogGeneralContractorSelect({
  value = [],
  options = [],
  loading = false,
  error = null,
  disabled = false,
  multiple = true,
  onChange,
  onRetry,
}) {
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = useMemo(
    () => Array.isArray(value)
      ? value.map(item => String(item).trim()).filter(Boolean)
      : [],
    [value],
  );

  const selectedKeys = useMemo(
    () => new Set(selected.map(normalizedKey)),
    [selected],
  );

  const referenceKeys = useMemo(
    () => new Set(options.map(option => normalizedKey(option.name))),
    [options],
  );

  const currentOnlyKeys = useMemo(
    () => new Set(
      selected
        .filter(name => !referenceKeys.has(normalizedKey(name)))
        .map(normalizedKey),
    ),
    [referenceKeys, selected],
  );

  const visibleOptions = useMemo(
    () => {
      const query = normalizedKey(search);
      const matches = query
        ? options.filter(option => optionSearchText(option).includes(query))
        : options;

      return matches.slice(0, 60);
    },
    [options, search],
  );

  useEffect(
    () => {
      function onPointerDown(event) {
        if (
          rootRef.current
          && !rootRef.current.contains(event.target)
        ) {
          setOpen(false);
        }
      }

      document.addEventListener('pointerdown', onPointerDown);

      return () => {
        document.removeEventListener('pointerdown', onPointerDown);
      };
    },
    [],
  );

  function removeName(name) {
    const key = normalizedKey(name);
    onChange(
      selected.filter(item => normalizedKey(item) !== key),
    );
  }

  function toggleOption(option) {
    const name = String(option?.name || '').trim();

    if (!name) {
      return;
    }

    const key = normalizedKey(name);

    if (selectedKeys.has(key)) {
      removeName(name);
      return;
    }

    if (multiple) {
      onChange([...selected, name]);
      setSearch('');
      searchRef.current?.focus();
      return;
    }

    onChange([name]);
    setSearch('');
    setOpen(false);
  }

  function openPicker() {
    if (disabled) {
      return;
    }

    setOpen(true);
  }

  const resultSummary = search
    ? `${visibleOptions.length}${visibleOptions.length === 60 ? '+' : ''} matching`
    : `${Math.min(options.length, 60)} of ${options.length}`;

  return (
    <div
      ref={rootRef}
      className={`bid-gc-picker${open ? ' open' : ''}${disabled ? ' disabled' : ''}`}
    >
      <div
        className="bid-gc-picker-control"
        onClick={openPicker}
      >
        {selected.length > 0 && (
          <div className="bid-gc-selected-list">
            {selected.map(name => (
              <span
                key={normalizedKey(name)}
                className={`bid-gc-selected-chip${currentOnlyKeys.has(normalizedKey(name)) ? ' current-only' : ''}`}
                title={
                  currentOnlyKeys.has(normalizedKey(name))
                    ? 'Current value; not found in Potential GCs.'
                    : name
                }
              >
                <span>{name}</span>
                {!disabled && (
                  <button
                    type="button"
                    aria-label={`Remove ${name}`}
                    onClick={event => {
                      event.stopPropagation();
                      removeName(name);
                    }}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        <div className="bid-gc-search-row">
          <span className="bid-gc-search-icon" aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            type="search"
            value={search}
            disabled={disabled}
            placeholder={
              selected.length
                ? (
                    multiple
                      ? 'Add another GC…'
                      : 'Search or change GC…'
                  )
                : 'Search Potential GCs…'
            }
            onFocus={() => setOpen(true)}
            onChange={event => {
              setSearch(event.target.value);
              setOpen(true);
            }}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                setOpen(false);
              }
            }}
          />
          {selected.length > 0 && !disabled && (
            <button
              type="button"
              className="bid-gc-clear-button"
              onClick={event => {
                event.stopPropagation();
                onChange([]);
              }}
            >
              Clear
            </button>
          )}
          <span className="bid-gc-chevron" aria-hidden="true">⌄</span>
        </div>
      </div>

      {open && !disabled && (
        <div className="bid-gc-picker-menu">
          <div className="bid-gc-picker-meta">
            <span>
              {loading
                ? 'Loading contractors…'
                : error
                  ? 'Could not load Potential GCs'
                  : `${resultSummary} contractors`}
            </span>
            {!loading && !error && (
              <span>{selected.length} selected</span>
            )}
          </div>

          {loading && (
            <div className="bid-gc-picker-state">
              Loading Potential GCs…
            </div>
          )}

          {!loading && error && (
            <div className="bid-gc-picker-state error">
              <span>{error}</span>
              <button
                type="button"
                className="secondary-button"
                onClick={onRetry}
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && visibleOptions.length === 0 && (
            <div className="bid-gc-picker-state">
              No matching contractors.
            </div>
          )}

          {!loading && !error && visibleOptions.length > 0 && (
            <div
              className="bid-gc-option-list"
              role="listbox"
              aria-multiselectable={multiple ? 'true' : undefined}
            >
              {visibleOptions.map(option => {
                const selectedOption = selectedKeys.has(
                  normalizedKey(option.name),
                );

                return (
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedOption}
                    className={`bid-gc-option${selectedOption ? ' selected' : ''}`}
                    key={option.sharePointItemId}
                    onClick={() => toggleOption(option)}
                  >
                    <span className="bid-gc-option-check" aria-hidden="true">
                      {selectedOption ? '✓' : ''}
                    </span>
                    <span className="bid-gc-option-copy">
                      <strong>{option.name}</strong>
                      {(option.cityStateZip || option.email) && (
                        <small>
                          {[option.cityStateZip, option.email]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {!loading && !error && options.length > 60 && !search && (
            <div className="bid-gc-picker-tip">
              Type a GC name, city, or email to narrow the list.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
