// Resizes the embedded booking page to fit its content.
// Usage: <iframe src=".../book/<studio>?embed=1" data-studio-form></iframe><script src=".../embed.js" async></script>
(function () {
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || d.type !== "studio-form-height") return;
    var frames = document.querySelectorAll("iframe[data-studio-form]");
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === e.source) frames[i].style.height = Math.ceil(d.height) + 20 + "px";
    }
  });
})();
