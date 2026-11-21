import React, { useEffect, useState } from 'react';
import heic2any from 'heic2any';
import LoadingSpinner from './LoadingSpinner';

/**
 * Renders a storage attachment in a browser.
 *
 * Mobile uploads are HEIC photos, which Chrome/Firefox/Edge cannot decode in
 * an <img> (net::ERR_BLOCKED_BY_ORB). Fetch the bytes through the signed proxy,
 * convert HEIC/HEIF to JPEG in the browser, and display the object URL.
 */
export default function ReportAttachment({ src, alt, width, height, style = {}, onPreview }) {
  const [displaySrc, setDisplaySrc] = useState(null);

  useEffect(() => {
    let active = true;
    let objectUrl = null;
    setDisplaySrc(null);

    fetch(src)
      .then((response) => {
        if (!response.ok) throw new Error('Attachment unavailable');
        return response.blob();
      })
      .then(async (blob) => {
        let output = blob;
        if (/heic|heif/i.test(blob.type) || /\.hei[cf]/i.test(src)) {
          try {
            output = await heic2any({ blob, toType: 'image/jpeg', quality: 0.8 });
            if (Array.isArray(output)) output = output[0];
          } catch (error) {
            console.warn('[Attachment] HEIC conversion failed:', error.message);
          }
        }
        objectUrl = URL.createObjectURL(output);
        if (active) setDisplaySrc(objectUrl);
      })
      .catch(() => {
        if (active) setDisplaySrc(src);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (!displaySrc) {
    return (
      <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  const image = <img src={displaySrc} alt={alt} style={{ width, height, objectFit: 'cover', ...style }} />;

  if (!onPreview) {
    return <a href={displaySrc} target="_blank" rel="noopener noreferrer" title={alt} onClick={(event) => event.stopPropagation()}>{image}</a>;
  }

  return (
    <button
      type="button"
      title={alt}
      onClick={(event) => { event.stopPropagation(); onPreview(displaySrc); }}
      style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in', lineHeight: 0 }}
    >
      {image}
    </button>
  );
}
