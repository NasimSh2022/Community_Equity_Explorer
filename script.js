require([
 "esri/WebMap",
 "esri/views/MapView",
 "esri/widgets/Legend"
], function(WebMap, MapView, Legend) {
 const webmap = new WebMap({
   portalItem: { id: "95e9773c9f83481882eac6343971dbdf" }
 });
 const view = new MapView({
   container: "viewDiv",
   map: webmap
 });
 let layer = null;
 let FACTORS = [];
 let selectedAttr = null;
 let rankingFeatures = [];
 const factorList = document.getElementById("factorList");
 const formulaText = document.getElementById("formulaText");
 new Legend({
   view: view,
   container: "legendDiv"
 });
 webmap.loadAll().then(function() {
   layer = webmap.allLayers.find(lyr => lyr.type === "feature");
   return layer.load();
 }).then(function() {
   FACTORS = layer.fields
     .filter(f => {
       const name = f.name.toLowerCase();
       const alias = (f.alias || "").toLowerCase();
       return (name.includes("factor") || alias.includes("factor")) &&
         ["integer", "small-integer", "double", "single"].includes(f.type);
     })
     .sort((a, b) => {
       const aNum = Number(((a.alias || a.name).match(/factor\s*_?(\d+)/i) || [])[1] || 999);
       const bNum = Number(((b.alias || b.name).match(/factor\s*_?(\d+)/i) || [])[1] || 999);
       return aNum - bNum;
     })
     .map(f => ({ field: f.name, label: f.alias || f.name }));
   buildFactorUI();
   applyRenderer();
   updateFormula();
 });
 function buildFactorUI() {
   factorList.innerHTML = "";
   FACTORS.forEach((factor, index) => {
     factorList.innerHTML += `
<div class="factor-row">
<input type="checkbox" id="enabled_${index}" class="factor-check" checked>
<label for="enabled_${index}">${factor.label}</label>
<select id="direction_${index}" class="direction-select">
<option value="positive" selected>↑</option>
<option value="negative">↓</option>
</select>
<select id="score_${index}" class="score-select">
<option value="1">1</option>
<option value="2">2</option>
<option value="3" selected>3</option>
<option value="4">4</option>
<option value="5">5</option>
</select>
</div>
     `;
   });
   FACTORS.forEach((factor, index) => {
     ["enabled", "direction", "score"].forEach(type => {
       document.getElementById(`${type}_${index}`).addEventListener("change", refreshAll);
     });
   });
   document.getElementById("colorRamp").addEventListener("change", applyRenderer);
   document.getElementById("selectAllBtn").addEventListener("click", function() {
     FACTORS.forEach((factor, index) => {
       document.getElementById(`enabled_${index}`).checked = true;
     });
     refreshAll();
   });
   document.getElementById("clearAllBtn").addEventListener("click", function() {
     FACTORS.forEach((factor, index) => {
       document.getElementById(`enabled_${index}`).checked = false;
     });
     refreshAll();
   });
   document.getElementById("rankingBtn").addEventListener("click", calculateRanking);
   document.getElementById("printBtn").addEventListener("click", function() {
     window.print();
   });
 }
 function refreshAll() {
   applyRenderer();
   updateFormula();
   updateInfo();
   if (rankingFeatures.length > 0) {
     calculateRanking();
   }
 }
 function isEnabled(index) {
   return document.getElementById(`enabled_${index}`).checked;
 }
 function getWeights() {
   return FACTORS.map((factor, index) => {
     if (!isEnabled(index)) return 0;
     return Number(document.getElementById(`score_${index}`).value);
   });
 }
 function getDirections() {
   return FACTORS.map((factor, index) => {
     return document.getElementById(`direction_${index}`).value;
   });
 }
 function buildArcadeExpression() {
   const weights = getWeights();
   const directions = getDirections();
   let parts = [];
   let totalWeight = 0;
   FACTORS.forEach((factor, index) => {
     const weight = weights[index];
     const direction = directions[index];
     if (weight > 0) {
       const valueExpression = direction === "positive"
         ? `DefaultValue($feature["${factor.field}"], 0)`
         : `(100 - DefaultValue($feature["${factor.field}"], 0))`;
       parts.push(`(${valueExpression}) * ${weight}`);
       totalWeight += weight;
     }
   });
   if (totalWeight === 0) return "0";
   return `(${parts.join(" + ")}) / ${totalWeight}`;
 }
 function getColorStops() {
   const ramp = document.getElementById("colorRamp").value;
   if (ramp === "redGreen") {
     return [
       { value: 0, color: "#d73027", label: "0" },
       { value: 25, color: "#fc8d59", label: "25" },
       { value: 50, color: "#ffffbf", label: "50" },
       { value: 75, color: "#91cf60", label: "75" },
       { value: 100, color: "#1a9850", label: "100" }
     ];
   }
   if (ramp === "yellowBlue") {
     return [
       { value: 0, color: "#ffffcc", label: "0" },
       { value: 25, color: "#a1dab4", label: "25" },
       { value: 50, color: "#41b6c4", label: "50" },
       { value: 75, color: "#2c7fb8", label: "75" },
       { value: 100, color: "#253494", label: "100" }
     ];
   }
   return [
     { value: 0, color: "#ffffff", label: "0" },
     { value: 25, color: "#bdbdbd", label: "25" },
     { value: 50, color: "#737373", label: "50" },
     { value: 75, color: "#252525", label: "75" },
     { value: 100, color: "#000000", label: "100" }
   ];
 }
 function applyRenderer() {
   if (!layer) return;
   layer.renderer = {
     type: "simple",
     label: "Custom Final Score",
     symbol: {
       type: "simple-fill",
       color: [180, 180, 180, 0.4],
       outline: {
         color: [90, 90, 90, 0.7],
         width: 0.4
       }
     },
     visualVariables: [{
       type: "color",
       valueExpression: buildArcadeExpression(),
       valueExpressionTitle: "Custom Final Score",
       stops: getColorStops()
     }]
   };
   layer.refresh();
 }
 function calculateScore(attr) {
   const weights = getWeights();
   const directions = getDirections();
   let numerator = 0;
   let totalWeight = 0;
   FACTORS.forEach((factor, index) => {
     const weight = weights[index];
     const direction = directions[index];
     if (weight > 0) {
       let value = Number(attr[factor.field]) || 0;
       if (direction === "negative") {
         value = 100 - value;
       }
       numerator += value * weight;
       totalWeight += weight;
     }
   });
   if (totalWeight === 0) return 0;
   return numerator / totalWeight;
 }
 function updateFormula() {
   const weights = getWeights();
   const directions = getDirections();
   let rows = [];
   let totalWeight = 0;
   FACTORS.forEach((factor, index) => {
     const weight = weights[index];
     const direction = directions[index];
     if (weight > 0) {
       const sign = direction === "positive" ? "↑" : "↓";
       rows.push(`${sign} ${factor.label} × ${weight}`);
       totalWeight += weight;
     }
   });
   if (rows.length === 0) {
     formulaText.innerHTML = "No factors selected.";
     return;
   }
   formulaText.innerHTML = `
     ${rows.join("<br>")}
<br><br>
<b>÷ ${totalWeight}</b>
   `;
 }
 function updateInfo() {
   if (!selectedAttr) return;
   const finalScore = calculateScore(selectedAttr);
   document.getElementById("info").innerHTML = `
<h3>DA ${selectedAttr.GEO_NAME || selectedAttr.OBJECTID}</h3>
<p><b>Custom Final Score:</b> ${finalScore.toFixed(2)}</p>
   `;
 }
 function calculateRanking() {
   if (!layer) return;
   const query = layer.createQuery();
   query.where = "1=1";
   query.outFields = ["*"];
   query.returnGeometry = true;
   layer.queryFeatures(query).then(function(results) {
     rankingFeatures = results.features.map(function(feature) {
       const score = calculateScore(feature.attributes);
       return {
         graphic: feature,
         attributes: feature.attributes,
         score: score,
         name: feature.attributes.GEO_NAME || feature.attributes.OBJECTID
       };
     });
     rankingFeatures.sort((a, b) => b.score - a.score);
     const top10 = rankingFeatures.slice(0, 10);
     const bottom10 = rankingFeatures.slice(-10).reverse();
     renderRankingList("top10List", top10);
     renderRankingList("bottom10List", bottom10);
   });
 }
 function renderRankingList(listId, items) {
   const list = document.getElementById(listId);
   list.innerHTML = "";
   items.forEach(function(item, index) {
     const li = document.createElement("li");
     li.innerHTML = `
<button class="ranking-item" data-objectid="${item.attributes[layer.objectIdField]}">
         DA ${item.name} — ${item.score.toFixed(2)}
</button>
     `;
     list.appendChild(li);
   });
   list.querySelectorAll(".ranking-item").forEach(function(button) {
     button.addEventListener("click", function() {
       const objectId = Number(this.dataset.objectid);
       const item = rankingFeatures.find(f => f.attributes[layer.objectIdField] === objectId);
       if (!item) return;
       selectedAttr = item.attributes;
       updateInfo();
       view.goTo({
         target: item.graphic.geometry,
         zoom: 14
       });
     });
   });
 }
 view.on("click", function(event) {
   view.hitTest(event).then(function(response) {
     const result = response.results.find(function(r) {
       return r.graphic && r.graphic.layer === layer;
     });
     if (!result) return;
     selectedAttr = result.graphic.attributes;
     updateInfo();
   });
 });
});