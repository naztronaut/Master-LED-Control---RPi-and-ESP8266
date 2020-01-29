let config = {
    url: 'http://192.168.1.225',
    multi: true,
    mqttHost: "192.168.1.244",
    mqttPort: 1884
};

let globalStatus = 0;
let currentColors = {};
let rgbBrightnessChange = false;
$(document).ready(function() {

    // Cache buster added because caching was a big problem on mobile
    let cacheBuster = new Date().getTime();

    // btnStatus();
    getLEDStatus('rgb');
    getLEDStatus('white');

    // RGB Slider
    let slider = document.getElementById('slider');
    // White Slider
    let wSlider = document.getElementById('wSlider');

    const pickr = Pickr.create({
        el: '.color-picker',
        theme: 'classic', // or 'monolith', or 'nano'
        lockOpacity: true,
        padding: 15,
        inline: true,

        swatches: [
            'rgba(255, 0, 0, 1)',
            'rgba(255, 82, 0, 1)',
            'rgba(0, 255, 0, 1)',
            'rgba(0, 0, 255, 1)',
            'rgba(27, 161, 17, 1)',
            'rgba(255, 255, 0, 1)', // yellow broken
            'rgba(255, 0, 255, 1)',
            'rgba(108, 16, 157, 1)',
            'rgba(0, 255, 255, 1)',
            'rgba(24, 139, 167, 1)',
            'rgba(255, 255, 255, 1)',
            'rgba(0, 0, 0, 1)',
        ],

        components: {

            // Main components
            preview: true,
            opacity: false,
            hue: true,

            // Input / output Options
            interaction: {
                hex: true,
                rgba: true,
                // hsla: true,
                // hsva: true,
                // cmyk: true,
                input: true,
                // clear: true,
                save: true
            }
        }
    });

    pickr.off().on('swatchselect', e => {
        // sendData(e); // Swatchselect apparently triggers save so it triggers sendData() automatically
        pickr.setColor(e.toRGBA().toString(0));
    });

    pickr.on('save', e => {
        // If 'save' is being triggered by brightness changes instead
        if(rgbBrightnessChange == false) {
            let tempColors = pickr.getColor().toRGBA();
            currentColors.red = Math.floor(tempColors[0]);
            currentColors.green = Math.floor(tempColors[1]);
            currentColors.blue = Math.floor(tempColors[2]);
            slider.noUiSlider.set(100); // sets slider value to 100 if color is changed manually
            $('#slider .noUi-connect').css('background', `rgb(${currentColors.red}, ${currentColors.green}, ${currentColors.blue}`);
        } else {
            rgbBrightnessChange = false;
        }
        sendData(e);
    });

    noUiSlider.create(slider, {
        behavior: "tap",
        start: [100],
        connect: [true, false],
        // direction: 'rtl',
        step: 5,
        range: {
            'min': [0],
            'max': [100]
        },
        pips: {
            mode: 'values',
            values: [0, 25, 50, 75, 100],
            density: 5,
            format: wNumb({
                decimals: 0,
                postfix: "%"
            })
        }
    });

    slider.noUiSlider.on('set', function(e) {
       let sliderVal = (slider.noUiSlider.get()/100);
       let newRed = Math.floor(currentColors.red * sliderVal);
       let newGreen = Math.floor(currentColors.green * sliderVal);
       let newBlue = Math.floor(currentColors.blue * sliderVal);
       rgbBrightnessChange = true;
       pickr.setColor(`rgb(${newRed}, ${newGreen}, ${newBlue})`);
    });

    function sendData(e){
        let obj = e.toRGBA();
        let red = Math.floor(obj[0]);
        let green = Math.floor(obj[1]);
        let blue = Math.floor(obj[2]);
        let queryBuilder = `red=${red}&green=${green}&blue=${blue}`;

        $.ajax({
            url: `${config.url}/api/lr/?${queryBuilder}&${cacheBuster}`,
            method: 'GET',
            dataType: 'json',
            cache: false,
            success: function (result) {
                // console.log(result);
                // console.log(currentColors);
            }
        });
    }

    function changeWhiteLed(frequency){
        $.ajax({
            url: `${config.url}/api/lr/white?white=${frequency}&${cacheBuster}`,
            method: 'GET',
            success: function(result) {
                // console.log(result);
            }
        });
    }

    noUiSlider.create(wSlider, {
        behavior: "tap",
        start: [100],
        connect: [false, true],
        step: 5,
        range: {
            'min': [0],
            'max': [100]
        },
        pips: {
            mode: 'values',
            values: [0, 25, 50, 75, 100],
            density: 5,
            format: wNumb({
                decimals: 0,
                postfix: "%"
            })
        }
    });

    wSlider.noUiSlider.on('change', function(e) {
       let sliderVal = (wSlider.noUiSlider.get()/100);
       changeWhiteLed(Math.floor(sliderVal * 255));
    });

    // Get RGB Status so Color Picker in UI is set to that color on page load
    function getLEDStatus(color) {
        $.ajax({
            url: `${config.url}/api/lr/getStatus?colors=${color}&${cacheBuster}`,
            method: 'GET',
            success: function(result) {
                if(color == 'rgb') {
                    let colors = `rgb(${result.red}, ${result.green}, ${result.blue})`;
                    currentColors.red = result.red;
                    currentColors.green = result.green;
                    currentColors.blue = result.blue;
                    pickr.setColor(colors);
                } else {
                    wSlider.noUiSlider.set(Math.floor((result.white / 255) * 100));
                }
            },
            complete: () => {
                $('.spinner-parent').hide();
            },
        });
    }

    /**
     * Kitchen Lights Start
     * Uses ESP8266 modules
     * @type {*|AudioNode|void|*}
     */

    // Change your username and pass to your mqtt broker - example username and password filled in below
    let client = mqtt.connect({servers : [{ host: config.mqttHost, port: config.mqttPort}], username : "hassmqtt", password :"hassmqtt1!"});
    getInitStatus();
    client.subscribe(['led/kitchenRight/status', 'led/kitchenLeft/status', 'garage/temperature', 'garage/humidity', 'dining/status', 'basement/status']);
    let rightLedStatus;
    let leftLedStatus;
    client.on("message", function (topic, payload) {
        let side;
        let resp = JSON.parse(payload.toString());
        // console.log(topic);
        if(topic == "led/kitchenLeft/status" || topic == "led/kitchenRight/status") {
            if (resp.side == 'right') {
                rightLedStatus = (resp.ledStatus == "off") ? 0 : 1;
                globalStatus = rightLedStatus;
                side = resp.side;
                if (config.multi) {
                    singleButton(side, rightLedStatus);
                }
            } else {
                leftLedStatus = (resp.ledStatus == "off") ? 0 : 1;
                side = resp.side;
                if (config.multi) {
                    singleButton(side, leftLedStatus);
                }
            }
        } else if (topic == "garage/temperature") {
            handleGarageTemperature(resp);
        } else if (topic == "garage/humidity") {
            handleGarageHumidity(resp);
        } else if (topic == "dining/status") {
            getDiningStatus(resp);
        } else if (topic == "basement/status") {
            getBasementStatus(resp);
        }
        btnStatus();
    });

    function getInitStatus() {
        client.publish('led/kitchenRight/currentStatus');
        client.publish('led/kitchenLeft/currentStatus');
    }

    if(config.multi) {
        $("#multi").show();
    }

    $('#btnToggle').off().on('change', function(e){
        console.log(e);
        let state;
        if(globalStatus == 0) {
            state = 'on';
            globalStatus = 1;
        } else {
            state = 'off';
            globalStatus = 0;
        }

        client.publish("led/kitchenRight/json", "{\"lightStatus\": \"" + state + "\"}");
        if(config.multi) {
            client.publish("led/kitchenLeft/json", "{\"lightStatus\": \"" + state + "\"}");
        }

    });

    // Main big button - uses kitchenRight for master data.
    function btnStatus() {

        if(globalStatus == 0) {
            $('#btnToggle').prop("checked", false);
            // $('#btnToggle').text('Turn On');
            // $('#btnToggle').removeClass().addClass('btn btn-block btn-dark');
        } else {
            $('#btnToggle').prop("checked", true);
            // $('#btnToggle').text('Turn Off')
            // $('#btnToggle').removeClass().addClass('btn btn-block btn-light');
        }
    }

    if(config.multi) {
        $('.single').off().on('click', function (e) {

            if($(e.target).data('side') == 'Right'){
                let tempState = (rightLedStatus == 0) ? "on" : "off";
                client.publish("led/kitchenRight/json", "{\"lightStatus\": \"" + tempState + "\"}")
            } else {
               let tempState = (leftLedStatus == 0) ? "on" : "off";
               client.publish("led/kitchenLeft/json", "{\"lightStatus\": \"" + tempState + "\"}")
            }

            e.preventDefault();
        });

        function singleButton(side, state) {
            if (state == 0) {
                $('#kitchen' + side).prop("checked", false);
                // $('#kitchen' + side).text(side + ' On');
                // $('#kitchen' + side).removeClass().addClass('btn btn-block btn-dark');
            } else {
                $('#kitchen' + side).prop("checked", true);
                // $('#kitchen' + side).text(side + ' Off');
                // $('#kitchen' + side).removeClass().addClass('btn btn-block btn-light');
            }
        }
    }

    /** Garage
     *
     * @param temperature
     */
    function handleGarageTemperature(temperature) {
        // console.log("temperature is: " + temperature + "\u00B0F");
        $("#temperature").text(temperature);
    }

    function handleGarageHumidity(humidity) {
        // console.log("Humidity is: " + humidity + "%");
        $("#humidity").text(humidity);
    }

    $("#garageButton").off().on('click', function (e) {
       client.publish("garageDoor/trigger");
    });

    /** Dining Room FEIT light
     * Uses TUYA app
     */

    let diningBrightnessSlider = document.getElementById('diningBrightnessSlider');
    let diningRoomLightStatus = "off";
    let diningRoomLightBrightness = "255";

    function getDiningStatus(e) {

        diningBrightnessSlider.noUiSlider.set(Math.floor((e.brightness / 255) * 100));
        if (e.status == "off") {
                $('#diningBtn').text('Dining On');
                $('#diningBtn').removeClass().addClass('btn btn-block btn-dark');
                diningRoomLightStatus = "off"
            } else {
                $('#diningBtn').text('Dining Off');
                $('#diningBtn').removeClass().addClass('btn btn-block btn-light');
                diningRoomLightStatus = "on";
                diningRoomLightBrightness = e.brightness;
            }
    }

    $("#diningBtn").off().on('click', function (e) {
        if(diningRoomLightStatus == "off") {
            client.publish('dining/light/on',  diningRoomLightBrightness);
        } else {
            client.publish('dining/light/off');
        }
        client.publish("garageDoor/trigger");
    });

    noUiSlider.create(diningBrightnessSlider, {
        behavior: "tap",
        start: [100],
        connect: [false, true],
        step: 5,
        range: {
            'min': [10],
            'max': [100]
        },
        pips: {
            mode: 'values',
            values: [10, 25, 50, 75, 100],
            density: 5,
            format: wNumb({
                decimals: 0,
                postfix: "%"
            })
        }
    });

    diningBrightnessSlider.noUiSlider.on('change', function(e) {
       let sliderVal = (diningBrightnessSlider.noUiSlider.get()/100);
       let calculated = (Math.floor(sliderVal * 255));
       // below 25 brightness (out of 255) is 'off' for this stupid light
       if(calculated > 25) {
        client.publish("dining/light/on", calculated.toString());
       } else {
           client.publish("dining/light/off");
       }

    });

    $('.color-box').off().on('click', function (e) {
        if($(e.target).data('kelvin')) {
            client.publish("dining/light/white", ($(e.target).data('kelvin')).toString());
        } else if($(e.target).data('color')){
            client.publish("dining/light/color", ($(e.target).data('color')).toString());
        } else if($(e.target).data('turnOff')){
            client.publish("dining/light/off");
        }
    });

    const diningPickr = Pickr.create({
        el: '.dining-color-picker',
        theme: 'classic', // or 'monolith', or 'nano'
        lockOpacity: true,
        padding: 15,
        inline: true,

        swatches: [
            'rgba(255, 0, 0, 1)',
            'rgba(255, 82, 0, 1)',
            'rgba(0, 255, 0, 1)',
            'rgba(0, 0, 255, 1)',
            'rgba(27, 161, 17, 1)',
            'rgba(255, 255, 0, 1)', // yellow broken
            'rgba(255, 0, 255, 1)',
            'rgba(108, 16, 157, 1)',
            'rgba(0, 255, 255, 1)',
            'rgba(24, 139, 167, 1)',
            'rgba(255, 255, 255, 1)'
        ],

        components: {
            // Main components
            preview: true,
            opacity: false,
            hue: true,
            // Input / output Options
            interaction: {
                hex: true,
                rgba: true,
                input: true,
                save: true
            }
        }
    });

    diningPickr.off().on('swatchselect', e => {
        // sendData(e); // Swatchselect apparently triggers save so it triggers sendData() automatically
        // console.log(e.toRGBA().toString(0));
        diningPickr.setColor(e.toRGBA().toString(0));
    });

    diningPickr.on('save', e => {
        // If 'save' is being triggered by brightness changes instead
            let tempColors = diningPickr.getColor().toRGBA();
            let newColor = {};
            newColor.red = Math.floor(tempColors[0]);
            newColor.green = Math.floor(tempColors[1]);
            newColor.blue = Math.floor(tempColors[2]);
            diningBrightnessSlider.noUiSlider.set(100); // sets slider value to 100 if color is changed manually
            $('#diningBrightnessSlider .noUi-connect').css('background', `rgb(${newColor.red}, ${newColor.green}, ${newColor.blue}`);
            client.publish("dining/light/colorRGB", `{"status": "on", "brightness": 35,"red": ${newColor.red}, "green": ${newColor.green}, "blue": ${newColor.blue}}`);
    });


    /** Basement FEIT light
     * Uses TUYA app
     */

    let basementBrightnessSlider = document.getElementById('basementBrightnessSlider');
    let basementRoomLightStatus = "off";
    let basementRoomLightBrightness = "255";

    function getBasementStatus(e) {

        basementBrightnessSlider.noUiSlider.set(Math.floor((e.brightness / 255) * 100));
        if (e.status == "off") {
                basementRoomLightStatus = "off"
            } else {
                basementRoomLightStatus = "on";
                basementRoomLightBrightness = e.brightness;
            }
    }

    noUiSlider.create(basementBrightnessSlider, {
        behavior: "tap",
        start: [100],
        connect: [false, true],
        step: 5,
        range: {
            'min': [10],
            'max': [100]
        },
        pips: {
            mode: 'values',
            values: [10, 25, 50, 75, 100],
            density: 5,
            format: wNumb({
                decimals: 0,
                postfix: "%"
            })
        }
    });

    basementBrightnessSlider.noUiSlider.on('change', function(e) {
       let sliderVal = (basementBrightnessSlider.noUiSlider.get()/100);
       let calculated = (Math.floor(sliderVal * 255));
       // below 25 brightness (out of 255) is 'off' for this stupid light
       if(calculated > 25) {
        client.publish("basement/light/on", calculated.toString());
       } else {
           client.publish("basement/light/off");
       }

    });

    $('.basement-color-box').off().on('click', function (e) {
        if($(e.target).data('kelvin')) {
            client.publish("basement/light/white", ($(e.target).data('kelvin')).toString());
        } else if($(e.target).data('color')){
            client.publish("basement/light/color", ($(e.target).data('color')).toString());
        } else if($(e.target).data('turnOff')){
            client.publish("basement/light/off");
        }
    });

    const basementPickr = Pickr.create({
        el: '.basement-color-picker',
        theme: 'classic', // or 'monolith', or 'nano'
        lockOpacity: true,
        padding: 15,
        inline: true,

        swatches: [
            'rgba(255, 0, 0, 1)',
            'rgba(255, 82, 0, 1)',
            'rgba(0, 255, 0, 1)',
            'rgba(0, 0, 255, 1)',
            'rgba(27, 161, 17, 1)',
            'rgba(255, 255, 0, 1)', // yellow broken
            'rgba(255, 0, 255, 1)',
            'rgba(108, 16, 157, 1)',
            'rgba(0, 255, 255, 1)',
            'rgba(24, 139, 167, 1)',
            'rgba(255, 255, 255, 1)'
        ],

        components: {
            // Main components
            preview: true,
            opacity: false,
            hue: true,
            // Input / output Options
            interaction: {
                hex: true,
                rgba: true,
                input: true,
                save: true
            }
        }
    });

    basementPickr.off().on('swatchselect', e => {
        basementPickr.setColor(e.toRGBA().toString(0));
    });

    basementPickr.on('save', e => {
        // If 'save' is being triggered by brightness changes instead
            let tempColors = basementPickr.getColor().toRGBA();
            let newColor = {};
            newColor.red = Math.floor(tempColors[0]);
            newColor.green = Math.floor(tempColors[1]);
            newColor.blue = Math.floor(tempColors[2]);
            basementBrightnessSlider.noUiSlider.set(100); // sets slider value to 100 if color is changed manually
            $('#basementBrightnessSlider .noUi-connect').css('background', `rgb(${newColor.red}, ${newColor.green}, ${newColor.blue}`);
            client.publish("basement/light/colorRGB", `{"status": "on", "brightness": 35,"red": ${newColor.red}, "green": ${newColor.green}, "blue": ${newColor.blue}}`);
    });

});