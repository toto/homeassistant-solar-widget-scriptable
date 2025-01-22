// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: yellow; icon-glyph: solar-panel;
// -- Configuration --

// Homeassistant API path without the trailing "/"
const URL = "http://homeassistant:8123/api"; 
// Set your home assistant access token
const TOKEN = 
  "ACCESS TOKEN";
// Sensor id that tracks power (W) flowing from the solar system/battery to your home
const TO_HOME_POWER_SENSOR_ID = "sensor.to_home_power_id";
// Sensor id that tracks energy (Wh) that flowed from the solar system/battery to your home today
const TODAY_ENERGY_SENSOR_ID = "sensor.to_home_energy_id";
// Sensor id that tracks the SoC (state of charge, %) of your solar battery system
const SOC_SENSOR_ID = "sensor.battery_soc_id";
// Sensor id that tracks if the battery is charging, discharging or standby
// Number, 0 = Standy, 1 = Charge, 2 = Discharge
const CHARGE_STATE_SENSOR_ID = "sensor.charge_state_id";
// Sensor id that tracks power (W) input from the solar panels
const SOLAR_POWER_SENSOR_ID = "sensor.solar_input_power_id";
// Name of the widget (shown on top of medium widget)
const NAME = "Solar Power";
// Set to `false` if you want to hide the solar input when it's 0W
const SHOW_ZERO_SOLAR_INPUT = true;

// -------------------

const PackState = {
  Standby: 0,
  Input: 1,
  Output: 2,
}

function packStateName(state) {
  if (typeof state !== 'number') { state = parseInt(state) }
  for (const [key, value] of Object.entries(PackState)) {
    if (value === state) {
      return key;
    }
  }
  return undefined;
}

async function fetchHistory(url, sensorId, token, since) {
  const request = new Request(
    `${url}/history/period/${since.toISOString()}?filter_entity_id=${sensorId}&significant_changes_only=true`
  );
  request.method = "GET";
  request.headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const data = await request.loadJSON();
  return data;
}

async function fetchState(url, sensorId, token) {
  const request = new Request(`${url}/states/${sensorId}`);
  request.method = "GET";
  request.headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const data = await request.loadJSON();
  return data;
}

const url = `http://homeassistant:8123/api`;

const beginningOfDay = new Date();
beginningOfDay.setHours(0);
beginningOfDay.setMinutes(0);
beginningOfDay.setSeconds(0);
beginningOfDay.setMilliseconds(0);

const promises = [
  // Fetch current power
  fetchState(URL, TO_HOME_POWER_SENSOR_ID, TOKEN),
  fetchHistory(URL, TODAY_ENERGY_SENSOR_ID, TOKEN, beginningOfDay),
  fetchState(URL, SOC_SENSOR_ID, TOKEN),
  fetchState(URL, CHARGE_STATE_SENSOR_ID, TOKEN), 
  fetchState(URL, SOLAR_POWER_SENSOR_ID, TOKEN),  
];

function batterySymbolForSoC(soc) {
  if (soc < 1) return SFSymbol.named("battery.0percent")
  if (soc <= 25) return SFSymbol.named("battery.25percent")
  if (soc <= 50) return SFSymbol.named("battery.50percent")
  if (soc <= 75) return SFSymbol.named("battery.75percent")
  return SFSymbol.named("battery.100percent")
}

function addSymbolAndText(stack, symbolName, text, font = Font.mediumSystemFont(12), size = 22) {
  const symbol = SFSymbol.named(symbolName);
  symbol.applyFont(Font.lightSystemFont(16));
  const batteryImage = symbol.image;
  const stackImage = stack.addImage(batteryImage);
  stackImage.centerAlignImage()
  stackImage.applyFittingContentMode()
  stackImage.imageSize = new Size(size, size);
  stackImage.tintColor = Color.white();

  const label = stack.addText(text);
  label.textColor = Color.white();
  label.font = font;

  return { label, image: stackImage }
}

function addChargeImageStack(homeData, chargeStack, font = Font.mediumSystemFont(12), size = 22) {
  let batteySymbol = "bolt.batteryblock.fill";
  if (homeData.chargeState === PackState.Standby) {
    batteySymbol = "batteryblock.fill";
  }
  const elemnts = []
  elemnts.push(addSymbolAndText(chargeStack, batteySymbol, `${homeData.soc}${homeData.socUnit}`, font, size));
  
  if (SHOW_ZERO_SOLAR_INPUT || homeData.solarInput > 0) {
    chargeStack.addSpacer(4)
    elemnts.push(addSymbolAndText(chargeStack, "sun.max.fill", `${homeData.solarInput}${homeData.solarInputUnit}`, font, size));
  }
  return elemnts;
}

/** Takes watt as a number and returns a string with either W or kW added
 * with the appropriate number of decimal points
 */
function wattText(watt) {
  if (typeof watt != "number") {
    console.error(`Trying to show ${watt} but it's a ${typeof watt} not a 'number'`);
    return "";
  }
  if (watt > 1000) {
    return `${(watt / 1000).toFixed(2)}kW`;
  }
  return `${watt.toFixed(0)}W`;
}

function createMediumWidget(homeData) {
  const mediumWidget = new ListWidget();
  const gradient = new LinearGradient();
  gradient.colors = [new Color("#0064A6"), new Color("#D6A94B")];
  gradient.locations = [0, 1];
  mediumWidget.backgroundGradient = gradient;

  const homeName = mediumWidget.addText(`☀️⚡️ ${homeData.name}`);
  homeName.textColor = Color.white();
  homeName.font = Font.boldSystemFont(12);

  mediumWidget.addSpacer();

  // Current Charge to home
  const houseStack = mediumWidget.addStack();
  houseStack.centerAlignContent();
  const watt = wattText(homeData.currentWatts);
  const titleText = houseStack.addText(watt);
  titleText.textColor = Color.white();
  titleText.font = Font.boldSystemFont(32);

  // Battery and solar input status
  const chargeStack = mediumWidget.addStack();
  chargeStack.spacing = 1;
  chargeStack.centerAlignContent();
  addChargeImageStack(homeData, chargeStack);

  // Total Output today
  const totalStack = mediumWidget.addStack();
  totalStack.spacing = 2;
  totalStack.centerAlignContent();
  const totalkWh = `${homeData.generationValue.toFixed(1)}kWh`;
  addSymbolAndText(totalStack, "house.fill", totalkWh, Font.mediumSystemFont(12), 20)
  
  mediumWidget.addSpacer();

  // Uptate timestamp Footer
  const updatedAtText = mediumWidget.addText(`Updated: ${homeData.lastUpdatedLabel}`);
  updatedAtText.textColor = Color.white();
  updatedAtText.font = Font.caption2();

  return mediumWidget;
}

function createRectangularLockScreenWidget(homeData) {
  const widget = new ListWidget();
  
  // First row
  const firstRow = widget.addStack();
  firstRow.centerAlignContent();
  firstRow.spacing = 1;
  const watts = wattText(homeData.currentWatts);
  addSymbolAndText(firstRow, "bolt.fill", watts, Font.boldSystemFont(14), 20)
  firstRow.addSpacer();

  // Second row
  const secondRowStack = widget.addStack();
  secondRowStack.centerAlignContent();
  secondRowStack.spacing = 1;
  addChargeImageStack(homeData, secondRowStack);
  
  
  // third row
  const thirdRow = widget.addStack();
  
  thirdRow.centerAlignContent();
  thirdRow.spacing = 3;
  
  const totalkWh = `${homeData.generationValue.toFixed(1)}kWh`;
  addSymbolAndText(thirdRow, "house.fill", totalkWh, Font.mediumSystemFont(12), 18)

  thirdRow.addSpacer(5);
  const updatedText = thirdRow.addText(homeData.lastUpdatedLabel);
  updatedText.leftAlignText();
  updatedText.textColor = new Color("FFFFFF", 0.5);
  updatedText.font = Font.systemFont(12);

  widget.addSpacer();

  return widget;
}

function createCircularLockScreenWidget(homeData) {
  const widget = new ListWidget();
  widget.addAccessoryWidgetBackground = true;

  widget.addSpacer();

  const watt = wattText(homeData.currentWatts);
  const titleText = widget.addText(watt);
  titleText.textColor = Color.white();
  titleText.minimumScaleFactor = 0.75;
  titleText.centerAlignText();
  titleText.font = Font.boldSystemFont(14);

  const totalkWh = `${homeData.generationValue.toFixed(1)}kWh`;
  const totalText = widget.addText(totalkWh);
  totalText.minimumScaleFactor = 0.75;
  totalText.centerAlignText();
  totalText.textColor = Color.white();
  totalText.font = Font.systemFont(12);

  widget.addSpacer();

  return widget;
}

function extractHomeData(data) {
  const result = {
    lastUpdated: null,
    lastUpdatedLabel: "-",
    currentWatts: 0, // W
    generationValue: 0, // kWh
    updated: null,
    name: NAME,
    soc: 0,
    socUnit: "%",
    chargeState: null,
    solarInput: 0,
    solarInputUnit: "W",
  };
  const [
    currentData,
    historicData,
    batterySoc,
    chargeState,
    solarInputData,
  ] = data;
  result.currentWatts = parseFloat(currentData.state);
  console.log(
    `Current: ${currentData.state}${currentData.attributes.unit_of_measurement}`
  );

  if (solarInputData.state) {
    console.log(
      `Solar Input: ${solarInputData.state}${solarInputData.attributes.unit_of_measurement}`
    )
    const input = parseInt(solarInputData.state);
    if (input !== NaN) {
      result.solarInput = input;
    }
    result.solarInputUnit = solarInputData.attributes.unit_of_measurement;
  } else {
    console.log(JSON.stringify(solarInputData))
  }

  if (batterySoc.state) {
    console.log(
      `SoC: ${batterySoc.state}${batterySoc.attributes.unit_of_measurement}`
    )
    const soc = parseInt(batterySoc.state);
    if (soc !== NaN) {
      result.soc = soc;
    }
  } 
  if (chargeState.state) {
    console.log(
      `State: ${packStateName(chargeState.state)}`
    )
    result.chargeState = parseInt(chargeState.state);
  }

  const [entries] = historicData;
  if (entries && entries.length > 0) {
    const firstEntry = entries[0];
    const lastEntry = entries[entries.length - 1];
    const energyDiff = lastEntry.state - firstEntry.state;
    result.generationValue = energyDiff; 
    console.log(
      `Generated: ${energyDiff}${firstEntry.attributes.unit_of_measurement}`
    );
    result.lastUpdated = new Date(lastEntry.last_updated);

    const formatter = new DateFormatter();
    if (new Date() - result.lastUpdated < 24 * 60 * 60 * 1000) {
      formatter.useShortTimeStyle();
      formatter.useNoDateStyle();
    } else {
      formatter.useNoTimeStyle();
      formatter.useShortDateStyle();
    }

    result.lastUpdatedLabel = `${formatter.string(
      result.lastUpdated,
      new Date()
    )}`;
  }

  console.log(`Home data: ${JSON.stringify(result, undefined, 2)}`)
  return result;
}

console.log(`Fetching HA API ${URL} data from sensors…`);
console.log(`Current Power Sensor: ${TO_HOME_POWER_SENSOR_ID}`);
console.log(`Historic Energy Sensor: ${TODAY_ENERGY_SENSOR_ID}`);
const data = await Promise.all(promises);
const homeData = extractHomeData(data);

let widget;

if (config.runsInAccessoryWidget) {
  console.log(`Create accessory widget (${config.widgetFamily})…`)
  if (config.widgetFamily == "accessoryCircular") {
    widget = createCircularLockScreenWidget(homeData);
  } else if (config.widgetFamily == "accessoryRectangular") {
    widget = createRectangularLockScreenWidget(homeData);
  }
} else if (config.runsInWidget) {
  console.log(`Create system widget (${config.widgetFamily})…`)
  widget = createMediumWidget(homeData);
} else {
  widget = createMediumWidget(homeData);
  console.log("Not running in widget or home screen");
  console.log(`config = ${JSON.stringify(config)}`);
  console.log(`Data: ${JSON.stringify(homeData, undefined, 2)}`)
}

if (widget) {
  Script.setWidget(widget);
}
Script.complete();
