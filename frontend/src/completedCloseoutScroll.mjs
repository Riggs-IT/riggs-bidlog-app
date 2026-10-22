// Keep the expanded closeout heading visible, using only the drawer's
// internal scroll port. Never call scrollIntoView on the document page.
export function scrollExpandedCloseoutIntoView(
  scrollContainer,
  disclosure,
  reducedMotion = false,
) {
  if (
    !scrollContainer
    || !disclosure?.open
    || typeof scrollContainer.scrollTo !== 'function'
  ) {
    return false;
  }

  const top = Number(scrollContainer.scrollTop);
  const maxScroll = Number(scrollContainer.scrollHeight)
    - Number(scrollContainer.clientHeight);
  const disclosureTop = Number(disclosure.getBoundingClientRect().top);
  const containerTop = Number(scrollContainer.getBoundingClientRect().top);

  if (![top, maxScroll, disclosureTop, containerTop].every(Number.isFinite)) {
    return false;
  }

  const desired = Math.max(
    0,
    Math.min(maxScroll, top + disclosureTop - containerTop - 12),
  );

  // No jump if the expanded section is already comfortably visible.
  if (desired <= top + 12) {
    return false;
  }

  scrollContainer.scrollTo({
    top: desired,
    behavior: reducedMotion ? 'auto' : 'smooth',
  });
  return true;
}
