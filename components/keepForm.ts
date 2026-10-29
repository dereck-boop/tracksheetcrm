import { startTransition, type FormEvent } from "react";

/**
 * onSubmit for a form whose action returns an error message: sends the form without React's
 * automatic reset, so what the person typed is still there when the error shows.
 */
export function submitKeeping(dispatch: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(fd));
  };
}
