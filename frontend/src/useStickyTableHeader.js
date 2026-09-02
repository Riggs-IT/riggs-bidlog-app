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

      floating.appendChild(
        floatingTable
      );

      document.body.appendChild(
        floating
      );


      let frame =
        null;

      let controlsIdleTimer =
        null;


      const hideFloatingControls =
        () => {
          floating.classList.remove(
            'controls-visible'
          );

          controlsIdleTimer =
            null;
        };


      const showFloatingControls =
        () => {
          if (!floatingControls) {
            return;
          }

          floating.classList.add(
            'controls-visible'
          );

          if (
            controlsIdleTimer !== null
          ) {
            window.clearTimeout(
              controlsIdleTimer
            );
          }

          controlsIdleTimer =
            window.setTimeout(
              hideFloatingControls,
              1200,
            );
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

          if (!shouldShow) {
            floating.classList.remove(
              'visible'
            );

            floating.classList.remove(
              'controls-visible'
            );

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

          floatingTable.style.transform =
            `translateX(${
              -wrapper.scrollLeft
            }px)`;


          floatingHeader
            .querySelectorAll(
              '.pivot-source-column, '
              + '.pivot-job-column, '
              + '.pivot-project-column'
            )
            .forEach(
              cell => {
                cell.style.position =
                  'relative';

                cell.style.zIndex =
                  '2';

                cell.style.transform =
                  `translateX(${
                    wrapper.scrollLeft
                  }px)`;
              }
            );


          floating.classList.add(
            'visible'
          );
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

        if (
          controlsIdleTimer !== null
        ) {
          window.clearTimeout(
            controlsIdleTimer
          );
        }


        resizeObserver.disconnect();


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
