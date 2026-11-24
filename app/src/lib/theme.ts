// Why: the saved theme must be applied before the page paints, or a dark-theme
//      user sees a flash of light. The layout (a server component) inlines this.
// How: a tiny script that copies localStorage "surge-theme" onto <html data-theme>.
export const THEME_KEY = "surge-theme";
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
