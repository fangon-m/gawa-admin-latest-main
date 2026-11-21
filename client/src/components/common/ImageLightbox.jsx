import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * The same lightbox used by the ID-verification EvidenceGallery, extracted so
 * other pages (issue reports) can preview images with an identical look.
 */
export default function ImageLightbox({ items = [], initialIndex = 0, onClose }) {
  const [index, setIndex] = useState(initialIndex);
  const count = items.length;
  const activeItem = items[index];

  const showPrev = useCallback(() => setIndex((current) => (current - 1 + count) % count), [count]);
  const showNext = useCallback(() => setIndex((current) => (current + 1) % count), [count]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowLeft' && count > 1) showPrev();
      else if (event.key === 'ArrowRight' && count > 1) showNext();
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, count, showPrev, showNext]);

  if (!activeItem) return null;

  return createPortal(
    <div className="evidence-lightbox" role="dialog" aria-modal="true" aria-label={activeItem.label || 'Image preview'} onClick={onClose}>
      <button className="evidence-lightbox__close" type="button" aria-label="Close preview" onClick={onClose}>
        <X size={22} />
      </button>

      {count > 1 && (
        <>
          <button className="evidence-lightbox__nav evidence-lightbox__nav--prev" type="button" aria-label="Previous image" onClick={(event) => { event.stopPropagation(); showPrev(); }}>
            <ChevronLeft size={28} />
          </button>
          <button className="evidence-lightbox__nav evidence-lightbox__nav--next" type="button" aria-label="Next image" onClick={(event) => { event.stopPropagation(); showNext(); }}>
            <ChevronRight size={28} />
          </button>
        </>
      )}

      <figure className="evidence-lightbox__figure" onClick={(event) => event.stopPropagation()}>
        <img className="evidence-lightbox__image" src={activeItem.url} alt={activeItem.label || 'Evidence'} />
        <figcaption className="evidence-lightbox__caption">
          {activeItem.label || `File ${index + 1}`}
          {count > 1 && <span className="evidence-lightbox__counter">{index + 1} / {count}</span>}
        </figcaption>
      </figure>
    </div>,
    document.body
  );
}
