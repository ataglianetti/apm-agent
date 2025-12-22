function findRelatedTracks(doc) {
  // Remember the link href
  // var href = window.location.href;

  // // Don't follow the link
  // event.preventDefault();

  console.log(doc);
  // window.location = href;
  return;
}

function getUrlParameter(name) {
  name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
  var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
  var results = regex.exec(location.search);
  return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

function displayControls(qf, pf) {
  var anchor = document.getElementById('controls-qf-anchor');
  var divQF = document.createElement('div');
  divQF.setAttribute('class', 'controls-column-left');
  anchor.appendChild(divQF);
  var divPF = document.createElement('div');
  divPF.setAttribute('class', 'controls-column-right');
  anchor.appendChild(divPF);
  qf.forEach(function (p) {
    var f = p.split('^');
    var label = document.createTextNode(f[0]);
    anchor.setAttribute('class', 'controls-field-label');
    divQF.appendChild(label);
    var input = document.createElement('input');
    input.setAttribute('type', 'text');
    input.setAttribute('class', 'controls-field-value');
    input.setAttribute('name', f[0]);
    input.setAttribute('value', f[1] ? f[1] : '1');
    divQF.appendChild(input);
    divQF.appendChild(document.createElement('br'));
  });
  pf.forEach(function (p) {
    var f = p.split('^');
    var label = document.createTextNode(f[0]);
    anchor.setAttribute('class', 'controls-field-label');
    divPF.appendChild(label);
    var input = document.createElement('input');
    input.setAttribute('type', 'text');
    input.setAttribute('class', 'controls-field-value');
    input.setAttribute('name', f[0]);
    input.setAttribute('value', f[1] ? f[1] : '1');
    divPF.appendChild(input);
    divPF.appendChild(document.createElement('br'));
  });
}
