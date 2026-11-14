import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, X, ChevronLeft, ChevronRight } from 'lucide-react';

export default function EvidenceGallery({ items = [] }) {
  const [activeIndex, setActiveIndex] = useState(null);

  // Only images open in the lightbox; placeholders stay in the grid.
  const imageItems = items.filter((item) => Boolean(item.url));
  const imageIndexByItem = new Map(imageItems.map((item, idx) => [item, idx]));
  const safeIndex = activeIndex != null && activeIndex < imageItems.length ? activeIndex : null;
  const activeItem = safeIndex != null ? imageItems[safeIndex] : null;

  const close = useCallback(() => setActiveIndex(null), []);
  const showPrev = useCallback(() => {
    setActiveIndex((idx) => (idx == null ? idx : (idx - 1 + imageItems.length) % imageItems.length));
  }, [imageItems.length]);
  const showNext = useCallback(() => {
    setActiveIndex((idx) => (idx == null ? idx : (idx + 1) % imageItems.length));
  }, [imageItems.length]);

  useEffect(() => {
    if (safeIndex == null) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') close();
      else if (event.key === 'ArrowLeft') showPrev();
      else if (event.key === 'ArrowRight') showNext();
    };

    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [safeIndex, close, showPrev, showNext]);

  if (items.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '1.5rem' }}>
        <div className="empty-state-text">No evidence attached</div>
      </div>
    );
  }

  return (
    <>
      <div className="evidence-gallery">
        {items.map((item, idx) => (
          item.url ? (
            <div
              key={idx}
              className="evidence-item"
              role="button"
              tabIndex={0}
              aria-label={`View ${item.label || `file ${idx + 1}`} full size`}
              onClick={() => setActiveIndex(imageIndexByItem.get(item))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setActiveIndex(imageIndexByItem.get(item));
                }
              }}
            >
              <img src={item.url} alt={item.label || 'Evidence'} loading="lazy" />
            </div>
          ) : (
            <div key={idx} className="evidence-item" style={{ cursor: 'default' }}>
              <div className="evidence-placeholder">
                <FileText size={24} />
                <span>{item.label || `File ${idx + 1}`}</span>
                {item.type && <span style={{ fontSize: '0.7rem' }}>{item.type}</span>}
              </div>
            </div>
          )
        ))}
      </div>

      {activeItem && createPortal(
        <div className="evidence-lightbox" role="dialog" aria-modal="true" aria-label={activeItem.label || 'Evidence preview'} onClick={close}>
          <button className="evidence-lightbox__close" type="button" aria-label="Close preview" onClick={close}>
            <X size={22} />
          </button>

          {imageItems.length > 1 && (
            <>
              <button
                className="evidence-lightbox__nav evidence-lightbox__nav--prev"
                type="button"
                aria-label="Previous image"
                onClick={(event) => { event.stopPropagation(); showPrev(); }}
              >
                <ChevronLeft size={28} />
              </button>
              <button
                className="evidence-lightbox__nav evidence-lightbox__nav--next"
                type="button"
                aria-label="Next image"
                onClick={(event) => { event.stopPropagation(); showNext(); }}
              >
                <ChevronRight size={28} />
              </button>
            </>
          )}

          <figure className="evidence-lightbox__figure" onClick={(event) => event.stopPropagation()}>
            <img className="evidence-lightbox__image" src={activeItem.url} alt={activeItem.label || 'Evidence'} />
            <figcaption className="evidence-lightbox__caption">
              {activeItem.label || `File ${safeIndex + 1}`}
              {imageItems.length > 1 && (
                <span className="evidence-lightbox__counter">{safeIndex + 1} / {imageItems.length}</span>
              )}
            </figcaption>
          </figure>
        </div>,
        document.body
      )}
    </>
  );
}
