import {
  useCallback,
  useEffect,
  useState,
} from 'react';


function stickyTopOffset() {
  const topbar =
    document.querySelector(
      '.topbar'
    );

  if (!topbar) {
    return 0;
  }

  const position =
    window.getComputedStyle(
      topbar
    ).position;

  if (position !== 'sticky') {
    return 0;
  }

  return Math.max(
    0,
    topbar
      .getBoundingClientRect()
      .bottom,
  );
}


export default function useStickyTableHeader(
  refreshKey,
) {
  const [
    wrapper,
    setWrapper,
  ] = useState(null);

  const wrapperRef =
    useCallback(
      node => {
        setWrapper(node);
      },
      [],
    );


  useEffect(
    () => {
      const table =
        wrapper?.querySelector(
          'table'
        );

      const header =
        table?.querySelector(
          'thead'
        );

      if (
        !wrapper
        || !table
        || !header
      ) {
        return undefined;
      }


      const shell =
        wrapper.closest(
          '.project-pivot-shell'
        );

      const controls =
        shell?.querySelector(
          '[data-sticky-table-controls]'
        )
        || null;


      const floating =
        document.createElement(
          'div'
        );

      floating.className =
        'floating-table-header';

      floating.setAttribute(
        'aria-hidden',
        'true',
      );


      let floatingControls =
        null;

      if (controls) {
        floatingControls =
          controls.cloneNode(true);

        floatingControls.classList.add(
          'floating-table-controls'
        );

        floatingControls
          .querySelectorAll('[id]')
          .forEach(
            element =>
              element.removeAttribute(
                'id'
              )
          );

        floatingControls
          .querySelectorAll(
            'button, a, input, select'
          )
          .forEach(
            element => {
              element.tabIndex = -1;
            }
          );

        floating.appendChild(
          floatingControls
        );
      }


      const floatingTable =
        table.cloneNode(false);

      floatingTable.classList.add(
        'floating-table-header-table'
      );


      const floatingHeader =
        header.cloneNode(true);

      floatingHeader
        .querySelectorAll('[id]')
        .forEach(
          element =>
            element.removeAttribute(
              'id'
            )
        );

      floatingHeader
        .querySelectorAll(
          'button, a, input, select'
        )
        .forEach(
          element => {
            element.tabIndex = -1;
          }
        );


      floatingTable.appendChild(
        floatingHeader
      );


      /*
        Keep the floating header in a real horizontal scroll
        viewport instead of translating the entire table and
        counter-translating pinned cells.

        That lets the cloned header use the exact same CSS
        position: sticky offsets as the real table body, so the
        pinned-column cutoff is identical in both places.
      */
      const floatingTableViewport =
        document.createElement(
          'div'
        );

      floatingTableViewport.className =
        'floating-table-header-viewport';

      floatingTableViewport.appendChild(
        floatingTable
      );

      floating.appendChild(
        floatingTableViewport
      );

      document.body.appendChild(
        floating
      );


      let frame =
        null;

      let controlsIdleTimer =
        null;

      let horizontalControlActive =
        false;

      const clearControlsIdleTimer =
        () => {
          if (controlsIdleTimer === null) {
            return;
          }

          window.clearTimeout(
            controlsIdleTimer
          );

          controlsIdleTimer =
            null;
        };

      const hideFloatingControls =
        () => {
          if (horizontalControlActive) {
            return;
          }

          floating.classList.remove(
            'controls-visible'
          );

          controlsIdleTimer =
            null;
        };

      const scheduleFloatingControlsHide =
        () => {
          clearControlsIdleTimer();

          controlsIdleTimer =
            window.setTimeout(
              hideFloatingControls,
              1800,
            );
        };

      const showFloatingControls =
        () => {
          if (!floatingControls) {
            return;
          }

          floating.classList.add(
            'controls-visible'
          );

          if (!horizontalControlActive) {
            scheduleFloatingControlsHide();
          }
        };


      const syncHorizontalControls =
        () => {
          if (!controls) {
            return;
          }

          const maxScroll =
            Math.max(
              0,
              wrapper.scrollWidth
                - wrapper.clientWidth,
            );

          [
            controls,
            floatingControls,
          ]
            .filter(Boolean)
            .forEach(
              controlRoot => {
                const range =
                  controlRoot.querySelector(
                    '[data-table-horizontal-scroll]'
                  );

                if (!range) {
                  return;
                }

                const maxValue =
                  String(maxScroll);

                if (range.max !== maxValue) {
                  range.max =
                    maxValue;
                }

                range.value =
                  String(
                    Math.min(
                      maxScroll,
                      Math.max(
                        0,
                        wrapper.scrollLeft,
                      ),
                    )
                  );

                const disabled =
                  maxScroll <= 0;

                if (range.disabled !== disabled) {
                  range.disabled =
                    disabled;
                }

                if (
                  controlRoot.classList.contains(
                    'horizontal-scroll-disabled'
                  )
                  !== disabled
                ) {
                  controlRoot.classList.toggle(
                    'horizontal-scroll-disabled',
                    disabled,
                  );
                }
              }
            );
        };


      const horizontalScrollStep =
        () => {
          const monthCell =
            header.querySelector(
              '.pivot-month-column'
            );

          return Math.max(
            90,
            monthCell
              ?.getBoundingClientRect()
              .width
              || 112,
          );
        };


      const handleHorizontalControlInput =
        event => {
          const range =
            event.target.closest(
              '[data-table-horizontal-scroll]'
            );

          if (!range) {
            return;
          }

          wrapper.scrollLeft =
            Number(range.value) || 0;

          showFloatingControls();
          scheduleUpdate();
        };


      const handleHorizontalControlPointerDown =
        event => {
          const control =
            event.target.closest(
              '[data-table-horizontal-scroll], '
              + '[data-table-horizontal-scroll-step]'
            );

          if (!control) {
            return;
          }

          horizontalControlActive =
            true;

          clearControlsIdleTimer();

          floating.classList.add(
            'controls-visible'
          );
        };


      const handleHorizontalControlPointerUp =
        () => {
          if (!horizontalControlActive) {
            return;
          }

          horizontalControlActive =
            false;

          scheduleUpdate();
          scheduleFloatingControlsHide();
        };


      const handleHorizontalControlClick =
        event => {
          const button =
            event.target.closest(
              '[data-table-horizontal-scroll-step]'
            );

          if (!button) {
            return;
          }

          const direction =
            Number(
              button.getAttribute(
                'data-table-horizontal-scroll-step'
              )
            ) || 0;

          wrapper.scrollBy({
            left:
              horizontalScrollStep()
              * direction,
            behavior: 'smooth',
          });

          showFloatingControls();
        };


      let floatingContentDirty =
        true;


      const sanitizeFloatingContent =
        root => {
          if (!root) {
            return;
          }

          root
            .querySelectorAll('[id]')
            .forEach(
              element =>
                element.removeAttribute(
                  'id'
                )
            );

          root
            .querySelectorAll(
              'button, a, input, select'
            )
            .forEach(
              element => {
                element.tabIndex = -1;
              }
            );
        };


      const syncFloatingContent =
        () => {
          if (
            !floatingContentDirty
            || horizontalControlActive
          ) {
            return;
          }

          /*
            The sticky header is a detached DOM copy.

            React updates the real header when async billing
            data arrives. Refresh the detached copy from the
            real DOM instead of relying on the original clone.
          */
          floatingHeader.replaceChildren(
            ...Array.from(
              header.childNodes
            ).map(
              node =>
                node.cloneNode(true)
            )
          );

          sanitizeFloatingContent(
            floatingHeader
          );


          if (
            controls
            && floatingControls
          ) {
            floatingControls.replaceChildren(
              ...Array.from(
                controls.childNodes
              ).map(
                node =>
                  node.cloneNode(true)
              )
            );

            sanitizeFloatingContent(
              floatingControls
            );
          }

          floatingContentDirty =
            false;
        };


      const syncColumnWidths =
        () => {
          const originalCells =
            header.querySelectorAll(
              'th'
            );

          const floatingCells =
            floatingHeader.querySelectorAll(
              'th'
            );

          originalCells.forEach(
            (cell, index) => {
              const floatingCell =
                floatingCells[index];

              if (!floatingCell) {
                return;
              }

              const width =
                cell
                  .getBoundingClientRect()
                  .width;

              floatingCell.style.width =
                `${width}px`;

              floatingCell.style.minWidth =
                `${width}px`;

              floatingCell.style.maxWidth =
                `${width}px`;
            }
          );
        };


      const update =
        () => {
          frame =
            null;

          syncFloatingContent();

          const wrapperRect =
            wrapper
              .getBoundingClientRect();

          const headerRect =
            header
              .getBoundingClientRect();

          const tableRect =
            table
              .getBoundingClientRect();

          const top =
            stickyTopOffset();

          const visibleLeft =
            Math.max(
              0,
              wrapperRect.left,
            );

          const visibleRight =
            Math.min(
              window.innerWidth,
              wrapperRect.right,
            );

          const width =
            Math.max(
              0,
              visibleRight
              - visibleLeft,
            );

          const shouldShow =
            width > 0
            && headerRect.top < top
            && tableRect.bottom
              > top
                + headerRect.height;


          syncHorizontalControls();


          if (!shouldShow) {
            floating.classList.remove(
              'visible'
            );

            floating.classList.remove(
              'controls-visible'
            );

            horizontalControlActive =
              false;

            clearControlsIdleTimer();

            return;
          }


          syncColumnWidths();


          floating.style.top =
            `${top}px`;

          floating.style.left =
            `${visibleLeft}px`;

          floating.style.width =
            `${width}px`;


          floatingTable.style.width =
            `${table.scrollWidth}px`;


          floating.classList.add(
            'visible'
          );

          /*
            Mirror the real table's scroll position directly.
            The cloned table's own sticky cells now pin
            themselves naturally using the same source-aware
            left offsets as the body table.
          */
          floatingTableViewport.scrollLeft =
            wrapper.scrollLeft;

          showFloatingControls();
        };


      const scheduleUpdate =
        () => {
          if (frame !== null) {
            return;
          }

          frame =
            window.requestAnimationFrame(
              update
            );
        };


      const handleScroll =
        () => {
          showFloatingControls();
          scheduleUpdate();
        };


      const handlePointerEnter =
        () => {
          if (
            floating.classList.contains(
              'visible'
            )
          ) {
            showFloatingControls();
          }
        };


      const forwardFloatingClick =
        event => {
          const clickedButton =
            event.target.closest(
              'button'
            );

          if (!clickedButton) {
            return;
          }


          if (
            floatingControls
            && floatingControls.contains(
              clickedButton
            )
          ) {
            const floatingButtons =
              Array.from(
                floatingControls
                  .querySelectorAll(
                    'button'
                  )
              );

            const originalButtons =
              Array.from(
                controls
                  .querySelectorAll(
                    'button'
                  )
              );

            const index =
              floatingButtons.indexOf(
                clickedButton
              );

            originalButtons[index]
              ?.click();

            showFloatingControls();

            return;
          }


          const floatingButtons =
            Array.from(
              floatingHeader
                .querySelectorAll(
                  'button'
                )
            );

          const originalButtons =
            Array.from(
              header
                .querySelectorAll(
                  'button'
                )
            );

          const index =
            floatingButtons.indexOf(
              clickedButton
            );

          originalButtons[index]
            ?.click();
        };


      const contentObserver =
        new MutationObserver(
          () => {
            floatingContentDirty =
              true;

            scheduleUpdate();
          }
        );


      const resizeObserver =
        new ResizeObserver(
          scheduleUpdate
        );

      resizeObserver.observe(
        wrapper
      );

      resizeObserver.observe(
        table
      );


      contentObserver.observe(
        header,
        {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
        },
      );

      if (controls) {
        contentObserver.observe(
          controls,
          {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
          },
        );
      }


      window.addEventListener(
        'scroll',
        handleScroll,
        {
          passive: true,
        },
      );

      window.addEventListener(
        'resize',
        scheduleUpdate,
      );

      wrapper.addEventListener(
        'scroll',
        handleScroll,
        {
          passive: true,
        },
      );

      wrapper.addEventListener(
        'pointerenter',
        handlePointerEnter,
        {
          passive: true,
        },
      );

      floating.addEventListener(
        'pointerenter',
        handlePointerEnter,
        {
          passive: true,
        },
      );

      controls?.addEventListener(
        'input',
        handleHorizontalControlInput,
      );

      controls?.addEventListener(
        'click',
        handleHorizontalControlClick,
      );

      floatingControls?.addEventListener(
        'input',
        handleHorizontalControlInput,
      );

      floatingControls?.addEventListener(
        'pointerdown',
        handleHorizontalControlPointerDown,
      );

      floatingControls?.addEventListener(
        'pointerup',
        handleHorizontalControlPointerUp,
      );

      floatingControls?.addEventListener(
        'pointercancel',
        handleHorizontalControlPointerUp,
      );

      window.addEventListener(
        'pointerup',
        handleHorizontalControlPointerUp,
      );

      window.addEventListener(
        'pointercancel',
        handleHorizontalControlPointerUp,
      );

      floating.addEventListener(
        'click',
        forwardFloatingClick,
      );


      scheduleUpdate();


      return () => {
        if (frame !== null) {
          window.cancelAnimationFrame(
            frame
          );
        }

        clearControlsIdleTimer();

        resizeObserver.disconnect();
        contentObserver.disconnect();


        window.removeEventListener(
          'scroll',
          handleScroll,
        );

        window.removeEventListener(
          'resize',
          scheduleUpdate,
        );

        wrapper.removeEventListener(
          'scroll',
          handleScroll,
        );

        wrapper.removeEventListener(
          'pointerenter',
          handlePointerEnter,
        );

        floating.removeEventListener(
          'pointerenter',
          handlePointerEnter,
        );

        controls?.removeEventListener(
          'input',
          handleHorizontalControlInput,
        );

        controls?.removeEventListener(
          'click',
          handleHorizontalControlClick,
        );

        floatingControls?.removeEventListener(
          'input',
          handleHorizontalControlInput,
        );

        floatingControls?.removeEventListener(
          'pointerdown',
          handleHorizontalControlPointerDown,
        );

        floatingControls?.removeEventListener(
          'pointerup',
          handleHorizontalControlPointerUp,
        );

        floatingControls?.removeEventListener(
          'pointercancel',
          handleHorizontalControlPointerUp,
        );

        window.removeEventListener(
          'pointerup',
          handleHorizontalControlPointerUp,
        );

        window.removeEventListener(
          'pointercancel',
          handleHorizontalControlPointerUp,
        );

        floating.removeEventListener(
          'click',
          forwardFloatingClick,
        );


        floating.remove();
      };
    },
    [
      refreshKey,
      wrapper,
    ],
  );


  return wrapperRef;
}
