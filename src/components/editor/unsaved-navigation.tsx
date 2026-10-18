"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useMemo,
} from "react";

const NavigationContext = createContext<{
  setDirty: (dirty: boolean) => void;
  confirmNavigation: () => boolean;
} | null>(null);
const indexKey = "__mofloNavigationIndex";
const warning = "You have unsaved changes. Leave this page and discard them?";

/** Guard the persistent shell so its links and sign-out share the editor's dirty state. */
export function UnsavedNavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const dirty = useRef(false);
  const confirmed = useRef(false);
  const setDirty = useCallback((value: boolean) => {
    dirty.current = value;
    confirmed.current = false;
  }, []);

  const confirmNavigation = useCallback(() => {
    const allowed = !dirty.current || window.confirm(warning);
    if (allowed) {
      confirmed.current = true;
    }
    return allowed;
  }, []);
  const context = useMemo(
    () => ({ setDirty, confirmNavigation }),
    [setDirty, confirmNavigation],
  );

  useEffect(() => {
    let currentIndex = Number(window.history.state?.[indexKey] ?? 0);
    let restoring = false;
    const originalPush = window.history.pushState;
    const originalReplace = window.history.replaceState;
    originalReplace.call(
      window.history,
      { ...window.history.state, [indexKey]: currentIndex },
      "",
    );
    const push: History["pushState"] = function (
      this: History,
      state,
      unused,
      url,
    ) {
      const nextIndex = currentIndex + 1;
      originalPush.call(this, { ...state, [indexKey]: nextIndex }, unused, url);
      currentIndex = nextIndex;
    };
    const replace: History["replaceState"] = function (
      this: History,
      state,
      unused,
      url,
    ) {
      originalReplace.call(
        this,
        { ...state, [indexKey]: currentIndex },
        unused,
        url,
      );
    };
    window.history.pushState = push;
    window.history.replaceState = replace;

    function click(event: MouseEvent) {
      if (
        !dirty.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      const navigation = target?.closest<HTMLAnchorElement | HTMLButtonElement>(
        "a[href], [data-leave-workspace]",
      );
      if (!navigation) {
        return;
      }
      if (navigation instanceof HTMLAnchorElement) {
        if (
          navigation.download ||
          (navigation.target && navigation.target !== "_self")
        ) {
          return;
        }
        const destination = new URL(navigation.href, window.location.href);
        // The browser's beforeunload guard handles external document navigation.
        if (
          destination.origin !== window.location.origin ||
          destination.href === window.location.href ||
          (destination.pathname === window.location.pathname &&
            destination.search === window.location.search)
        ) {
          return;
        }
      }
      if (!window.confirm(warning)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else {
        confirmed.current = true;
      }
    }
    function pop(event: PopStateEvent) {
      const destinationIndex = Number(
        event.state?.[indexKey] ?? currentIndex - 1,
      );
      if (restoring) {
        restoring = false;
        event.stopImmediatePropagation();
        return;
      }
      if (dirty.current && !window.confirm(warning)) {
        event.stopImmediatePropagation();
        restoring = true;
        window.history.go(currentIndex - destinationIndex || 1);
        return;
      }
      currentIndex = destinationIndex;
      confirmed.current = true;
    }
    function unload(event: BeforeUnloadEvent) {
      if (dirty.current && !confirmed.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", pop, true);
    window.addEventListener("beforeunload", unload);
    return () => {
      document.removeEventListener("click", click, true);
      window.removeEventListener("popstate", pop, true);
      window.removeEventListener("beforeunload", unload);
      if (window.history.pushState === push) {
        window.history.pushState = originalPush;
      }
      if (window.history.replaceState === replace) {
        window.history.replaceState = originalReplace;
      }
    };
  }, []);
  return (
    <NavigationContext.Provider value={context}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useUnsavedNavigation(dirty: boolean) {
  const context = useContext(NavigationContext);
  const setDirty = context?.setDirty;
  useEffect(() => {
    setDirty?.(dirty);
    return () => setDirty?.(false);
  }, [dirty, setDirty]);
  return context?.confirmNavigation ?? (() => true);
}
