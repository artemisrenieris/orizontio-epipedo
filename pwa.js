if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => registration.update())
      .catch((error) => {
        console.warn("Service worker registration failed:", error);
      });
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}
