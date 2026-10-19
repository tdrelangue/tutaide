"use client";

import { useEffect, useState } from "react";

/** Whether a CSS media query matches; false during the server render. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const list = window.matchMedia(query);
    function handleChange() {
      setMatches(list.matches);
    }
    handleChange();
    list.addEventListener("change", handleChange);
    return () => list.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
}
