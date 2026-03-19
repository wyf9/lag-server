import "clsx";
let _state = { token: null, user: null, loaded: false };
function getSessionState() {
  return _state;
}
export {
  getSessionState as g
};
