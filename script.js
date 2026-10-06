// 
// TYAC Official Portal JavaScript
// All original behaviours are preserved: scroll-spy navigation, contact form
// notice, scroll reveal, button ripple and the dynamic footer year.
// Added: the measuring rail, the plotter (strip) image reveal and the
// CAD crosshair cursor.
// 

document.addEventListener("DOMContentLoaded", () => {

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const viewportHeight = () =>
        window.innerHeight || document.documentElement.clientHeight;

    // Is the element inside the viewport (with a tolerance so it triggers just before it lands)?
    const isInView = (element, threshold) => {
        const rect = element.getBoundingClientRect();
        return rect.top < viewportHeight() * threshold && rect.bottom > 0;
    };

    // 
    // SECTION REGISTRY — drives scroll-spy and the measuring rail
    // 
    // Pages may override the registry with body[data-sheets]="id:sheet:LABEL;…"
    const SHEETS = (document.body.dataset.sheets ||
        "home:01:HOME;about:03:ABOUT;blog:04:BLOG;contact:05:CONTACT")
        .split(";")
        .map(entry => {
            const [id, sheet, label] = entry.split(":");
            return { id, sheet, label };
        });

    const sections = document.querySelectorAll("section");
    const navLinks = document.querySelectorAll(".nav-link");
    const rail = document.querySelector(".rail");
    const railStamp = document.querySelector(".rail__stamp");
    const railTrack = document.querySelector(".rail__track");

    // 
    // PLOTTER REVEAL — images print themselves in vertical strips
    // 
    const printPlotter = (plotter) => {
        const strips = plotter.querySelectorAll(".plotter__strip");

        strips.forEach((strip, i) => {
            window.setTimeout(() => strip.classList.add("is-in"), i * 55);
        });

        // Hand back to the intact image once the strips have finished printing,
        // so no strip seams remain in the resting state.
        window.setTimeout(() => {
            plotter.classList.add("is-revealed");
        }, strips.length * 55 + 600);
    };

    const stagePlotter = (plotter) => {
        const image = plotter.querySelector(".plotter__img");
        if (!image || plotter.dataset.staged === "true") return;

        const strips = 8;
        const container = document.createElement("div");
        container.className = "plotter__strips";
        container.setAttribute("aria-hidden", "true");

        for (let i = 0; i < strips; i++) {
            const strip = document.createElement("div");
            strip.className = "plotter__strip";
            strip.style.left = `${(i * 100) / strips}%`;
            strip.style.width = `${100 / strips}%`;

            const slice = image.cloneNode(true);
            slice.classList.remove("plotter__img");
            slice.removeAttribute("alt");
            slice.setAttribute("alt", "");
            slice.style.width = `${strips * 100}%`;
            slice.style.left = `${-i * 100}%`;

            strip.appendChild(slice);
            container.appendChild(strip);
        }

        plotter.appendChild(container);
        plotter.classList.add("is-staged");
        plotter.dataset.staged = "true";
    };

    document.querySelectorAll(".plotter").forEach(stagePlotter);

    // 
    // SCROLL REVEAL ANIMATION
    // 
    const revealElements = [
        ...document.querySelectorAll(
            ".pillar-card, .story-card, .leader-card, .blog-card, .info-card, .section-head"
        )
    ].filter(element => !element.classList.contains("reveal"));

    if (!prefersReducedMotion) {
        revealElements.forEach((element, i) => {
            element.classList.add("reveal");
            element.style.setProperty("--d", `${(i % 3) * 0.08}s`);
        });
    }

    // 
    // VIEWPORT PASS — plotters print and reveals fire as they come into view
    // 
    const updateViewport = () => {
        document
            .querySelectorAll('.plotter[data-staged="true"]:not([data-printed="true"])')
            .forEach(plotter => {
                if (!isInView(plotter, 0.95)) return;
                plotter.dataset.printed = "true";
                printPlotter(plotter);
            });

        revealElements.forEach(element => {
            if (element.classList.contains("is-visible")) return;
            if (isInView(element, 0.92)) element.classList.add("is-visible");
        });
    };

    // 
    // SCROLL FRAME — scroll-spy, measuring rail and viewport pass, throttled
    // 
    let ticking = false;

    const onScrollFrame = () => {
        ticking = false;

        // Active section (original scroll-spy behaviour)
        let current = "";

        sections.forEach(section => {
            const sectionTop = section.offsetTop - 150;
            const sectionHeight = section.clientHeight;

            if (window.scrollY >= sectionTop &&
                window.scrollY < sectionTop + sectionHeight) {
                current = section.getAttribute("id");
            }
        });

        navLinks.forEach(link => {
            const href = link.getAttribute("href") || "";
            // Links to another page carry their own state (e.g. the Youth tab on youth.html)
            if (!href.startsWith("#")) return;

            const isActive = href === `#${current}`;
            link.classList.toggle("is-active", isActive);
            if (isActive) link.setAttribute("aria-current", "true");
            else link.removeAttribute("aria-current");
        });

        // Measuring rail: progress + current sheet
        if (rail) {
            const scrollable = document.documentElement.scrollHeight - window.innerHeight;
            const progress = scrollable > 0 ? Math.min(Math.max(window.scrollY / scrollable, 0), 1) : 0;
            rail.style.setProperty("--p", progress.toFixed(4));
        }

        if (railStamp) {
            const active = SHEETS.find(s => s.id === current) || SHEETS[0];
            railStamp.textContent = `${active.sheet} / ${active.label}`;
        }

        updateViewport();
    };

    const requestScrollFrame = () => {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(onScrollFrame);
    };

    window.addEventListener("scroll", requestScrollFrame, { passive: true });

    // 
    // MEASURING RAIL — millimetre markings drawn to the height of the track
    // 
    const drawRailTicks = () => {
        if (!railTrack) return;

        const height = railTrack.clientHeight;
        if (height < 80) return;

        const step = 16;
        const count = Math.max(2, Math.floor(height / step));
        const gap = height / (count - 1);

        railTrack.querySelectorAll(".rail__tick").forEach(t => t.remove());

        for (let i = 0; i < count; i++) {
            const tick = document.createElement("span");
            tick.className = "rail__tick";
            if (i % 5 === 0) {
                tick.classList.add("rail__tick--major");
                const value = document.createElement("span");
                value.textContent = String(i * 20);
                tick.appendChild(value);
            }
            tick.style.top = `${Math.round(i * gap)}px`;
            railTrack.appendChild(tick);
        }
    };

    // 
    // CAD CROSSHAIR CURSOR (fine pointers only)
    // 
    const cursor = document.querySelector(".cursor");

    if (cursor && window.matchMedia("(pointer: fine)").matches && !prefersReducedMotion) {
        const cursorLabel = cursor.querySelector(".cursor__label");
        let cursorX = window.innerWidth / 2;
        let cursorY = window.innerHeight / 2;
        let cursorFrame = null;

        document.body.classList.add("has-cursor");

        const renderCursor = () => {
            cursorFrame = null;
            cursor.style.transform = `translate(${cursorX}px, ${cursorY}px)`;
        };

        window.addEventListener("mousemove", (e) => {
            cursorX = e.clientX;
            cursorY = e.clientY;
            if (!cursorFrame) cursorFrame = window.requestAnimationFrame(renderCursor);
        }, { passive: true });

        const interactiveSelector = "a, button, .plate";

        document.addEventListener("mouseover", (e) => {
            const target = e.target.closest(interactiveSelector);
            if (!target) return;
            cursorLabel.textContent = target.dataset.cursor || "VIEW";
            cursor.classList.add("is-active");
        });

        document.addEventListener("mouseout", (e) => {
            const target = e.target.closest(interactiveSelector);
            if (!target) return;
            if (target.contains(e.relatedTarget)) return;
            cursor.classList.remove("is-active");
        });
    }

    // 
    // CONTACT FORM HANDLER (Option A: Standard Redirect Submission)
    // 
    const form = document.querySelector("#contact-form");

    if (form) {
        const status = document.querySelector("#contact-status");
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            status.className = "form-status";
            status.textContent = "Sending securely...";
            const data = Object.fromEntries(new FormData(form).entries());

            try {
                const response = await fetch("/api/contact", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    credentials: "same-origin",
                    body: JSON.stringify(data)
                });
                const result = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(result.message || "Unable to send message.");
                status.classList.add("is-success");
                status.textContent = result.message || "Your message has been received.";
                form.reset();
            } catch (error) {
                status.classList.add("is-error");
                status.textContent = error.message || "The message service is unavailable.";
            }
        });
    }

    // 
    // VOLUNTEER SIGN-UP FORM — composes the message on the visitor's own device.
    // This site has no backend, so nothing is submitted from here: we open the
    // visitor's mail client with every field already written out.
    // 
    const signupForm = document.querySelector("#signup-form");

    if (signupForm) {
        const status = signupForm.querySelector(".form-status");

        signupForm.addEventListener("submit", (e) => {
            e.preventDefault();

            const data = new FormData(signupForm);
            const value = (key) => (data.get(key) || "").toString().trim();

            const subject = `Volunteer sign-up — ${value("name")}`;
            const body = [
                `Name: ${value("name")}`,
                `Email: ${value("email")}`,
                `Age range: ${value("age") || "Not given"}`,
                `Community: ${value("community")}`,
                `Role wanted: ${value("role") || "Any role"}`,
                "",
                "Story / message:",
                value("story") || "(none given)"
            ].join("\n");

            if (status) {
                status.textContent =
                    "Opening your email app with these details — press send there to reach us.";
            }

            window.location.href =
                `mailto:theyouthallianceforchange@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        });
    }

    // 
    // BUTTON RIPPLE EFFECT
    // 
    const buttons = document.querySelectorAll(".btn");

    buttons.forEach(button => {
        button.addEventListener("click", function (e) {
            const ripple = document.createElement("span");

            const rect = this.getBoundingClientRect();

            ripple.style.width = ripple.style.height = "20px";
            ripple.style.position = "absolute";
            ripple.style.borderRadius = "50%";
            ripple.style.background = "rgba(255,255,255,0.4)";
            ripple.style.left = `${e.clientX - rect.left}px`;
            ripple.style.top = `${e.clientY - rect.top}px`;
            ripple.style.transform = "translate(-50%, -50%)";
            ripple.style.pointerEvents = "none";
            ripple.style.animation = "ripple 0.6s linear";

            this.appendChild(ripple);

            setTimeout(() => {
                ripple.remove();
            }, 600);
        });
    });

    // 
    // DYNAMIC FOOTER YEAR
    // 
    const footerCopy = document.querySelector(".footer-copy");

    if (footerCopy) {
        footerCopy.innerHTML =
            `&copy; ${new Date().getFullYear()} TYAC. Built to modern web production and accessibility standards.`;
    }

    // 
    // FIRST PASS — after fonts and images settle, then on resize
    // 
    const firstPass = () => {
        drawRailTicks();
        onScrollFrame();
    };

    firstPass();
    window.addEventListener("load", firstPass);

    let resizeTimer = null;
    window.addEventListener("resize", () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(firstPass, 180);
    });

    // =========================================================================
    // TYAC UPGRADE — LIVE LIBERIA TIME/DATE + SECURE MEMBERSHIP API
    // =========================================================================
    const formatLiberiaDateTime = () => {
        const now = new Date();
        const time = new Intl.DateTimeFormat("en-LR", {
            timeZone: "Africa/Monrovia",
            hour: "2-digit", minute: "2-digit", second: "2-digit",
            hour12: false
        }).format(now);
        const date = new Intl.DateTimeFormat("en-LR", {
            timeZone: "Africa/Monrovia",
            weekday: "long", year: "numeric", month: "long", day: "numeric"
        }).format(now);

        document.querySelectorAll("#live-time, #footer-time").forEach(el => el.textContent = time);
        document.querySelectorAll("#live-date, #footer-date").forEach(el => el.textContent = date);
    };
    formatLiberiaDateTime();
    window.setInterval(formatLiberiaDateTime, 1000);

    const membershipForm = document.querySelector("#membership-form");
    if (membershipForm) {
        const status = document.querySelector("#membership-status");
        membershipForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            status.className = "form-status";
            status.textContent = "Submitting securely...";
            const data = Object.fromEntries(new FormData(membershipForm).entries());

            try {
                const response = await fetch("/api/members", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    credentials: "same-origin",
                    body: JSON.stringify(data)
                });
                const result = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(result.message || "Registration failed.");
                status.classList.add("is-success");
                status.textContent = result.message || "Registration received successfully.";
                membershipForm.reset();
            } catch (error) {
                status.classList.add("is-error");
                status.textContent = error.message || "Unable to submit right now.";
            }
        });
    }

});
