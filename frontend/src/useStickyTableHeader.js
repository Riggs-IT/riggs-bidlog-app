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
    topbar.getBoundingClientRect()
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

      let frame = null;

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
                cell.getBoundingClientRect()
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

      const update = () => {
        frame = null;

        const wrapperRect =
          wrapper.getBoundingClientRect();

        const headerRect =
          header.getBoundingClientRect();

        const tableRect =
          table.getBoundingClientRect();

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
            > top + headerRect.height;

        if (!shouldShow) {
          floating.classList.remove(
            'visible'
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
          `translateX(${-wrapper.scrollLeft}px)`;

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

              cell.style.zIndex = '2';

              cell.style.transform =
                `translateX(${wrapper.scrollLeft}px)`;
            }
          );

        floating.classList.add(
          'visible'
        );
      };

      const scheduleUpdate = () => {
        if (frame !== null) {
          return;
        }

        frame =
          window.requestAnimationFrame(
            update
          );
      };

      const forwardHeaderClick =
        event => {
          const clickedButton =
            event.target.closest(
              'button'
            );

          if (!clickedButton) {
            return;
          }

          const floatingButtons =
            Array.from(
              floatingHeader.querySelectorAll(
                'button'
              )
            );

          const originalButtons =
            Array.from(
              header.querySelectorAll(
                'button'
              )
            );

          const index =
            floatingButtons.indexOf(
              clickedButton
            );

          originalButtons[index]?.click();
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
        scheduleUpdate,
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
        scheduleUpdate,
        {
          passive: true,
        },
      );

      floating.addEventListener(
        'click',
        forwardHeaderClick,
      );

      scheduleUpdate();

      return () => {
        if (frame !== null) {
          window.cancelAnimationFrame(
            frame
          );
        }

        resizeObserver.disconnect();

        window.removeEventListener(
          'scroll',
          scheduleUpdate,
        );

        window.removeEventListener(
          'resize',
          scheduleUpdate,
        );

        wrapper.removeEventListener(
          'scroll',
          scheduleUpdate,
        );

        floating.removeEventListener(
          'click',
          forwardHeaderClick,
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
