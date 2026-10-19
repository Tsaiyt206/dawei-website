(() => {
  "use strict";

  const config = {
    enabled: document.body.dataset.weiweiPet !== "off",
    size: "clamp(142px, 14vw, 208px)",
    mobileSize: "112px",
    tabletSize: "128px",
    rightMargin: 25,
    bottomMargin: 20,
    holdMs: 300,
    smileMs: 1200,
    dialogueMs: 4800,
    lines: [
      "你好~我是沩沩！",
      "我是来自未来科技世界的酷龙~",
      "我拥有开启人工智能世界的能量哦~",
      "我擅长指导运动与健身的姿势哦！",
    ],
  };
  const frameNames = {
    idle: "idle", lift: "lift", landing: "landing", left: "peek_left",
    right: "peek_right", blink: "blink", smile: "smile",
  };
  const asset = (name) => new URL(`./assets/weiwei-pet/${frameNames[name]}.png`, document.baseURI).href;
  let instance = null;

  function init() {
    if (instance || !config.enabled) return instance;

    const pet = document.createElement("div");
    pet.className = "dw-weiwei-pet dw-weiwei-initializing";
    pet.setAttribute("aria-label", "沩沩网页桌宠");
    pet.style.setProperty("--dw-weiwei-size", config.size);
    pet.style.setProperty("--dw-weiwei-mobile-size", config.mobileSize);
    pet.style.setProperty("--dw-weiwei-tablet-size", config.tabletSize);

    const sprite = document.createElement("img");
    sprite.className = "dw-weiwei-pet__image";
    sprite.src = asset("idle");
    sprite.alt = "";
    sprite.draggable = false;

    const hit = document.createElement("button");
    hit.className = "dw-weiwei-pet__hit";
    hit.type = "button";
    hit.setAttribute("aria-label", "沩沩桌宠，短按微笑并说话，长按拖动，点击边缘探头返回");

    const hint = document.createElement("span");
    hint.className = "dw-weiwei-pet__hint";
    hint.setAttribute("aria-hidden", "true");
    pet.append(sprite, hit, hint);

    const dialogue = document.createElement("div");
    dialogue.className = "dw-weiwei-dialogue";
    dialogue.role = "status";
    dialogue.setAttribute("aria-live", "polite");
    dialogue.setAttribute("aria-atomic", "true");
    dialogue.hidden = true;
    document.body.append(pet, dialogue);

    Object.keys(frameNames).forEach((name) => {
      const image = new Image();
      image.src = asset(name);
    });

    const events = new AbortController();
    const timers = new Set();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const dims = () => ({ w: pet.offsetWidth, h: pet.offsetHeight });
    let x = 0, y = 0, startX = 0, startY = 0, startPX = 0, startPY = 0;
    let holdTimer = null, speechTimer = null, smileTimer = null, blinkTimer = null, landTimer = null;
    let lastLine = -1, downAt = 0, pending = false, dragging = false, moved = false;
    let activePointer = null, peekSide = null, destroyed = false;
    let userPositioned = false, positionFrame = null;
    let angle = 0, angularV = 0, targetAngle = 0, lastMoveT = 0, lastMoveX = 0;
    let lastTick = performance.now(), physicsFrame = null, initFrame = null;
    let lastViewportWidth = innerWidth, lastViewportHeight = innerHeight;

    function schedule(fn, delay) {
      const id = setTimeout(() => { timers.delete(id); fn(); }, delay);
      timers.add(id);
      return id;
    }

    function clearScheduled(id) {
      if (id !== null) { clearTimeout(id); timers.delete(id); }
      return null;
    }

    function frame(name) {
      sprite.src = asset(name);
      pet.dataset.frame = name;
    }

    function placeDialogue() {
      if (dialogue.hidden) return;
      const { w, h } = dims();
      const width = dialogue.offsetWidth || 260;
      const height = dialogue.offsetHeight || 70;
      const left = clamp(x + w * .5 - width * .5, 12, Math.max(12, innerWidth - width - 12));
      let top = y - height - 12;
      if (top < 12) top = y + h * .68 + 12;
      top = clamp(top, 12, Math.max(12, innerHeight - height - 12));
      dialogue.style.left = `${left}px`;
      dialogue.style.top = `${top}px`;
    }

    function position(nextX, nextY) {
      x = nextX;
      y = nextY;
      pet.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      placeDialogue();
    }

    function defaultPosition() {
      const { w, h } = dims();
      let nextX = innerWidth - w - config.rightMargin;
      let bottom = config.bottomMargin;
      if (location.hash === "#league") {
        bottom = innerWidth >= 900 && innerHeight > 700 ? 200 : config.bottomMargin;
      } else {
        const sidebar = document.querySelector(".map-sidebar");
        const bounds = sidebar?.getBoundingClientRect();
        if (innerWidth >= 900 && bounds && bounds.width &&
            bounds.top < innerHeight * .7 && bounds.bottom > innerHeight * .3) {
          nextX = Math.min(nextX, bounds.left - w - 20);
        }
      }
      return [clamp(nextX, 8, Math.max(8, innerWidth - w - 8)),
        Math.max(8, innerHeight - h - bottom)];
    }

    function updateObstruction() {
      const { w, h } = dims();
      const obstructed = innerWidth < 900 && [".case-list", ".league-case-nav"].some((selector) => {
        const bounds = document.querySelector(selector)?.getBoundingClientRect();
        return bounds && bounds.width && bounds.height &&
          x + w * .8 > bounds.left && x + w * .2 < bounds.right &&
          y + h * .95 > bounds.top && y + h * .1 < bounds.bottom;
      });
      pet.classList.toggle("dw-weiwei-obscured", !!obstructed);
      dialogue.classList.toggle("dw-weiwei-obscured", !!obstructed);
      if (obstructed) stopTalking();
    }

    function reposition() {
      if (dragging || pending || peekSide) return;
      const { w, h } = dims();
      if (userPositioned) {
        position(clamp(x, 0, Math.max(0, innerWidth - w)),
          clamp(y, 0, Math.max(0, innerHeight - h)));
      } else {
        position(...defaultPosition());
      }
      updateObstruction();
    }

    function stopTalking() {
      speechTimer = clearScheduled(speechTimer);
      smileTimer = clearScheduled(smileTimer);
      dialogue.hidden = true;
      pet.classList.remove("dw-weiwei-smiling");
      if (pet.dataset.frame === "smile") frame("idle");
    }

    function unpeek() {
      frame("idle");
      peekSide = null;
      pet.className = "dw-weiwei-pet";
      hint.textContent = "";
      const { w } = dims();
      position(clamp(x, 12, innerWidth - w - 12), y);
    }

    function talk() {
      if (dragging || pending) return;
      if (peekSide) unpeek();
      landTimer = clearScheduled(landTimer);
      stopTalking();
      pet.className = "dw-weiwei-pet dw-weiwei-smiling";
      frame("smile");
      let next = Math.floor(Math.random() * (config.lines.length - (lastLine < 0 ? 0 : 1)));
      if (lastLine >= 0 && next >= lastLine) next++;
      lastLine = next;
      dialogue.textContent = config.lines[next];
      dialogue.hidden = false;
      placeDialogue();
      smileTimer = schedule(() => {
        pet.classList.remove("dw-weiwei-smiling");
        if (pet.dataset.frame === "smile") frame("idle");
      }, config.smileMs);
      speechTimer = schedule(() => { dialogue.hidden = true; }, config.dialogueMs);
    }

    function hide(side) {
      stopTalking();
      landTimer = clearScheduled(landTimer);
      frame(side === "left" ? "left" : "right");
      peekSide = side;
      pet.className = `dw-weiwei-pet dw-weiwei-peek dw-weiwei-peek-${side}`;
      hint.textContent = "点我回来~";
      const { w, h } = dims();
      const nextX = side === "left" ? -w * (212 / 1198) : innerWidth - w * (986 / 1198);
      position(nextX, clamp(y, 65, innerHeight - h * .58));
    }

    function landing() {
      landTimer = clearScheduled(landTimer);
      frame("landing");
      pet.className = "dw-weiwei-pet dw-weiwei-landing";
      hint.textContent = "";
      landTimer = schedule(() => {
        if (!dragging && !peekSide) {
          pet.className = "dw-weiwei-pet";
          frame("idle");
        }
      }, 460);
    }

    function reset() {
      stopTalking();
      holdTimer = clearScheduled(holdTimer);
      landTimer = clearScheduled(landTimer);
      activePointer = null;
      pending = false;
      dragging = false;
      peekSide = null;
      angle = angularV = targetAngle = 0;
      pet.className = "dw-weiwei-pet";
      hint.textContent = "";
      frame("idle");
      userPositioned = false;
      position(...defaultPosition());
      updateObstruction();
    }

    function physics(time) {
      const dt = Math.min((time - lastTick) / 1000, .04);
      lastTick = time;
      if (innerWidth !== lastViewportWidth || innerHeight !== lastViewportHeight) {
        lastViewportWidth = innerWidth;
        lastViewportHeight = innerHeight;
        if (peekSide) hide(peekSide);
        else if (!pet.classList.contains("dw-weiwei-hidden")) reposition();
      }
      if (dragging) {
        if (time - lastMoveT > 75) targetAngle = 0;
        angularV += (targetAngle - angle) * 85 * dt;
        angularV *= Math.exp(-11 * dt);
        angle += angularV * dt;
        if (targetAngle === 0 && Math.abs(angle) < .03 && Math.abs(angularV) < .1) {
          angle = 0;
          angularV = 0;
        }
        pet.style.setProperty("--dw-weiwei-tilt", `${reduced.matches ? 0 : angle}deg`);
      }
      physicsFrame = requestAnimationFrame(physics);
    }

    function scheduleBlink() {
      blinkTimer = schedule(() => {
        if (!reduced.matches && !pending && !dragging && !peekSide &&
            !pet.classList.contains("dw-weiwei-landing") && !pet.classList.contains("dw-weiwei-smiling")) {
          frame("blink");
          schedule(() => { if (pet.dataset.frame === "blink") frame("idle"); }, 125);
        }
        scheduleBlink();
      }, 3300 + Math.random() * 3000);
    }

    hit.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      if (activePointer !== null) return;
      event.preventDefault();
      downAt = performance.now();
      activePointer = event.pointerId;
      try { hit.setPointerCapture(event.pointerId); } catch (_) { /* Browser may release capture. */ }
      startPX = event.clientX;
      startPY = event.clientY;
      startX = x;
      startY = y;
      pending = true;
      dragging = false;
      moved = false;
      holdTimer = clearScheduled(holdTimer);
      holdTimer = schedule(() => {
        if (!pending) return;
        stopTalking();
        if (peekSide) unpeek();
        landTimer = clearScheduled(landTimer);
        frame("lift");
        angle = angularV = targetAngle = 0;
        lastMoveT = performance.now();
        lastMoveX = startPX;
        pet.style.setProperty("--dw-weiwei-tilt", "0deg");
        pet.className = "dw-weiwei-pet dw-weiwei-dragging";
        hint.textContent = "拎起来啦!";
        dragging = true;
      }, config.holdMs);
    }, { signal: events.signal });

    hit.addEventListener("pointermove", (event) => {
      if (event.pointerId !== activePointer || !pending) return;
      const dx = event.clientX - startPX;
      const dy = event.clientY - startPY;
      if (!dragging && Math.hypot(dx, dy) > 13) {
        moved = true;
        holdTimer = clearScheduled(holdTimer);
      }
      if (!dragging) return;
      if (Math.hypot(dx, dy) > 13) moved = true;
      if (moved) userPositioned = true;
      const now = performance.now();
      const elapsed = Math.max(8, now - lastMoveT);
      targetAngle = clamp((event.clientX - lastMoveX) / elapsed * 14, -22, 22);
      lastMoveX = event.clientX;
      lastMoveT = now;
      const { w, h } = dims();
      position(clamp(startX + dx, -w * .65, innerWidth - w * .35),
        clamp(startY + dy, -h * .12, innerHeight - h * .44));
    }, { signal: events.signal });

    function finish(event) {
      if (event.pointerId !== activePointer) return;
      holdTimer = clearScheduled(holdTimer);
      pending = false;
      try { if (hit.hasPointerCapture(event.pointerId)) hit.releasePointerCapture(event.pointerId); } catch (_) { /* Already released. */ }
      activePointer = null;
      if (dragging) {
        dragging = false;
        const { w, h } = dims();
        if (moved && x < 45) { hide("left"); return; }
        if (moved && x + w > innerWidth - 45) { hide("right"); return; }
        position(clamp(x, 0, innerWidth - w), clamp(y, 4, innerHeight - h + 12));
        landing();
        updateObstruction();
      } else if (!moved && performance.now() - downAt < config.holdMs) {
        if (peekSide) unpeek();
        talk();
      }
    }

    hit.addEventListener("pointerup", finish, { signal: events.signal });
    hit.addEventListener("pointercancel", (event) => {
      if (event.pointerId !== activePointer) return;
      holdTimer = clearScheduled(holdTimer);
      pending = false;
      dragging = false;
      activePointer = null;
      if (peekSide) hide(peekSide);
      else landing();
    }, { signal: events.signal });
    hit.addEventListener("lostpointercapture", (event) => {
      if (event.pointerId !== activePointer) return;
      holdTimer = clearScheduled(holdTimer);
      pending = false;
      activePointer = null;
      if (dragging) { dragging = false; landing(); }
    }, { signal: events.signal });
    hit.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (!event.repeat && !dragging && !pending) talk();
      }
    }, { signal: events.signal });
    window.addEventListener("resize", () => {
      if (peekSide) hide(peekSide);
      else reposition();
    }, { signal: events.signal });
    window.addEventListener("hashchange", reposition, { signal: events.signal });
    window.addEventListener("scroll", () => {
      if (positionFrame !== null) return;
      positionFrame = requestAnimationFrame(() => {
        positionFrame = null;
        reposition();
      });
    }, { passive: true, signal: events.signal });

    const overlay = document.querySelector("#caseOverlay");
    function updateVisibility() {
      const hidden = overlay?.classList.contains("is-open") || !!document.fullscreenElement;
      if (hidden) {
        stopTalking();
        if (pending || dragging) reset();
      }
      pet.classList.toggle("dw-weiwei-hidden", hidden);
      dialogue.classList.toggle("dw-weiwei-hidden", hidden);
      if (!hidden) reposition();
    }
    const observer = overlay ? new MutationObserver(updateVisibility) : null;
    observer?.observe(overlay, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("fullscreenchange", updateVisibility, { signal: events.signal });
    updateVisibility();

    reset();
    pet.classList.add("dw-weiwei-initializing");
    initFrame = requestAnimationFrame(() => {
      initFrame = requestAnimationFrame(() => pet.classList.remove("dw-weiwei-initializing"));
    });
    physicsFrame = requestAnimationFrame(physics);
    scheduleBlink();

    instance = {
      destroy() {
        if (destroyed) return;
        destroyed = true;
        events.abort();
        observer?.disconnect();
        for (const id of timers) clearTimeout(id);
        timers.clear();
        cancelAnimationFrame(physicsFrame);
        cancelAnimationFrame(initFrame);
        if (positionFrame !== null) cancelAnimationFrame(positionFrame);
        pet.remove();
        dialogue.remove();
        instance = null;
      },
    };
    return instance;
  }

  window.DAWEIWeiweiPet = {
    config,
    init,
    destroy() { instance?.destroy(); },
  };
  init();
})();
