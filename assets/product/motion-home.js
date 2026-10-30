// Homepage only. GSAP + ScrollTrigger replace si-motion.js here so the old
// IntersectionObserver opacity does not fight these tweens. Other pages still
// use si-motion. commons.js owns the join form and directory; do not intercept submit.
(function () {
  if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;

  gsap.registerPlugin(ScrollTrigger);

  var q = new URLSearchParams(location.search);
  var done = q.get("motion") === "done" || q.get("done") === "1";
  var SCROLL = [
    [".principles", ".principles > h2", 0.2],
    [".principle-list", ".principle-list > .principle", 0.28],
    ["#learn", "#learn .shell.intro > *", 0.2],
    ["#learn .guide", "#learn .guide-item", 0.28],
    ["#participate", "#participate .join-intro, #participate .product-actions", 0.18]
  ];

  var mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: no-preference)", function () {
    if (done) return;
    document.documentElement.classList.add("js-motion");
    var ease = "power3.out";
    gsap.timeline({ defaults: { ease: ease, duration: 1 } })
      .fromTo(".hero-copy > *", { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, stagger: 0.12 })
      .fromTo(".scroll-cue", { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0 }, "-=0.4");
    SCROLL.forEach(function (row, i) {
      var trigger = row[0];
      var targets = row[1];
      var stagger = row[2];
      var join = i === 4;
      gsap.fromTo(targets, { autoAlpha: 0, y: join ? 0 : 56 }, {
        autoAlpha: 1,
        y: 0,
        duration: 1.05,
        ease: ease,
        stagger: stagger,
        immediateRender: false,
        scrollTrigger: { trigger: trigger, start: "top 85%", once: true }
      });
    });
    return function () {
      ScrollTrigger.getAll().forEach(function (t) { t.kill(); });
      document.documentElement.classList.remove("js-motion");
    };
  });
})();
