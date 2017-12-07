//
// Program editor panel.
// The main UI panel for dataflow program editing.
//
var ProgramEditorPanel = function(options) {

    this.m_scale        = null;
    this.m_diagram      = null;
    this.m_diagramName  = null;
    this.m_modified     = null;
    this.m_svgDrawer    = null;

    this.container      = options.container;

    var _this           = this;

    //
    // Drag block state
    //
    this.m_dragBlock        = null;
    this.m_dragBlockOffsetX = null;
    this.m_dragBlockOffsetY = null;

    this.m_activeStartPin   = null;
    this.m_activeLineSvg    = null;

    //
    // Create block palette
    //
    var palDiv = $('<div>', {   id: 'block-palette',
                                css: {
                                        top:        '50px',
                                        position:   'absolute',
                                        zIndex:     100,
                                        border:     '1px solid lightgrey',
                                        width:      '100px' } } );

    var palette = ProgramEditorBlockPalette({   container: palDiv,
                                                programEditorPanel: this });

    this.container.append(palDiv);

    //
    // Create div for svg drawer.
    //
    var svgWrapper = $('<div>', { css: { } });
    var svgDiv = $('<div>', {   id: 'program-holder', 
                                css: {  position:   'absolute',
                                        width:      '100%',
                                        height:     '600px' } } );
    svgWrapper.append(svgDiv);
    this.container.append(svgWrapper);

    //
    // Return current diagram
    //
    this.getDiagram = function() { return this.m_diagram; }

    //
    // Load a diagram from a spec dictionary into the UI editor
    //
    this.loadProgram = function(programSpec) {

        if(this.m_svgDrawer == null) {
            this.m_svgDrawer = SVG('program-holder');
            $('#program-holder').mousemove(this.mouseMove);
            $('#program-holder').mouseup(this.mouseUp);
        }

        // console.log("[DEBUG] loadProgram", programSpec);

        //
        // Maintain set of block names
        //
        this.nameHash = {};

        //
        // Default empty program
        //
        if(!programSpec) {
            programSpec = { blocks: [] };
        }

        //
        // bind zoom menu/function to keyboard keys
        //
        $(document).bind('keydown', 'ctrl+i', zoominBlock);
        $(document).bind('keydown', 'ctrl+o', zoomoutBlock);

        if (this.m_diagram) {  // remove any existing diagram elements
            for (var i = 0; i < this.m_diagram.blocks.length; i++) {
                // console.log("[DEBUG] undisplay block", this.m_diagram.blocks[i]);
                this.undisplayBlock(this.m_diagram.blocks[i]);
            }
        }

        this.m_scale = 1.0;
        this.m_diagram = specToDiagram(programSpec);
        this.m_diagramName = programSpec.name;

        //zoomBlocks(this.m_diagram.blocks, this.m_scale);

        //
        // Display blocks
        //
        for (var i = 0; i < this.m_diagram.blocks.length; i++) {
            // console.log("[DEBUG] display block", this.m_diagram.blocks[i]);
            var block = this.m_diagram.blocks[i];
            this.displayBlock(block);
            this.nameHash[block.name] = block;
        }

        //
        // Display connections
        //
        for (var i = 0; i < this.m_diagram.blocks.length; i++) {
            var block = this.m_diagram.blocks[i];
            for (var j = 0; j < block.pins.length; j++) {
                var pin = block.pins[j];
                if (pin.sourcePin) {
                    // console.log("[DEBUG] displayConnection", pin);
                    this.displayConnection(pin, this.m_scale);
                }
            }
        }

        m_modified = false;
    };

    //
    // Create HTML/DOM elements for a block along with SVG pins.
    //
    this.displayBlock = function(block) {
        var blockDiv = $('<div>', {class: 'flowBlock', id: 'b_' + block.id});
        block.view.div = blockDiv;
        //var scale = block.ctx.scale;
        //var scale = 0.6;

        //
        // Add menu
        //
        var menuData = createMenuData();
        menuData.add('Rename', this.renameBlock, {id: block.id});
        menuData.add('Delete', this.deleteBlock, {id: block.id});
        //menuData.add('Zoom In (Ctrl+i)', zoominBlock, {id: block.id});
        //menuData.add('Zoom Out (Ctrl+o)', zoomoutBlock, {id: block.id});

        //if (block.hasSeq) {
        //    menuData.add('View Recorded Data', viewRecordedData, {id: block.id});
        //}
        var menuHolderDiv = $('<div>', {class: 'flowBlockMenuHolder'});
        var menuDiv = $('<div>', {class: 'dropdown flowBlockMenu'}).appendTo(menuHolderDiv);
        var menuInnerDiv = $('<div>', {
            'class': 'dropdown-toggle',
            'id': 'bm_' + block.id,
            'data-toggle': 'dropdown',
            'aria-expanded': 'true',
        }).appendTo(menuDiv);
        $('<span>', {class: 'flowBlockIcon glyphicon glyphicon-align-justify noSelect', 'aria-hidden': 'true'}).appendTo(menuInnerDiv);
        createDropDownList({menuData: menuData}).appendTo(menuDiv);
        menuHolderDiv.appendTo(blockDiv);

        //
        // add name, value, and units
        //
        if (block.type !== 'plot') {
            $('<div>', {class: 'flowBlockName noSelect', id: 'bn_' + block.id, html: block.name}).appendTo(blockDiv);
        }
        if (block.type === 'number_entry') {
            var input = $('<input>', {class: 'form-control flowBlockInput', type: 'text', id: 'bv_' + block.id}).appendTo(blockDiv);
            if (block.value !== null) {
                input.val(block.value);
            }
            input.mousedown(function(e) {e.stopPropagation()});
            input.keyup(block.id, _this.numberEntryChanged);
        } else if (block.type === 'plot') {
            var canvas = $('<canvas>', {class: 'flowBlockPlot', width: 300, height: 200, id: 'bc_' + block.id}).appendTo(blockDiv);
            canvas.mousedown(this.blockMouseDown);
            canvas.mousemove(this.mouseMove);
            canvas.mouseup(this.mouseUp);
            blockDiv.addClass('flowBlockWithPlot');
        } else if (block.outputType === 'i') {  // image-valued blocks
            $('<img>', {class: 'flowBlockImage', width: 320, height: 240, id: 'bi_' + block.id}).appendTo(blockDiv);
            blockDiv.addClass('flowBlockWithImage');
            this.appendBlockParametersToBlockDiv(block, blockDiv);
        } else {
            var div = $('<div>', {class: 'flowBlockValueAndUnits noSelect'});
            $('<span>', {class: 'flowBlockValue', html: '...', id: 'bv_' + block.id}).appendTo(div);

            // console.log("[DEBUG] units:", block.units);

            if (block.units) {
                // console.log("[DEBUG] Fixing units:", block.units);
                var units = block.units;
                units = units.replace('degrees ', '&deg;');  // note removing space
                units = units.replace('percent', '%');
                $('<span>', {class: 'flowBlockUnits', html: ' ' + units}).appendTo(div);
            }
            div.appendTo(blockDiv);
            if (block.type === 'number_display_and_input') {
                this.appendBlockParametersToBlockDiv(block, blockDiv);
            }
        }

        //
        // Position the block as specified
        //
        var x = block.view.x;
        var y = block.view.y;
        x = x * this.m_scale;
        y = y * this.m_scale;
        blockDiv.css('top', y + 'px');
        blockDiv.css('left', x + 'px');

        // console.log("blockDiv: x,y="+x+","+y);

        //
        // Add a mousedown handler for dragging/moving blocks
        //
        blockDiv.mousedown(this.blockMouseDown);

        //
        // Add to DOM before get dimensions
        //
        blockDiv.appendTo($('#program-holder'));

        //
        // Display plot after added to DOM
        //
        if (block.type === 'plot') {
            displayPlot(block);
        }
        this.scaleClasses();

        //
        // Get dimensions of block div
        //
        var w = parseInt(blockDiv.outerWidth(true));  // true to include the margin in the width
        var h = parseInt(blockDiv.outerHeight());  // not passing true here because we don't want the bottom margin

        // console.log("[DEBUG] block w,h=" + w + ", " + h);

        block.view.w = w;
        block.view.h = h;

        var pinRadius = 15 * this.m_scale;
        if (pinRadius > 15) {
            pinRadius = 15;
        } else if (pinRadius < 8) {
            pinRadius = 8;
        }

        //
        // Position and draw pins
        //
        for (var i = 0; i < block.pins.length; i++) {
            var pin = block.pins[i];
            if (pin.isInput) {
                if (block.inputCount == 1) {
                    pin.view.offsetX = -5;
                    pin.view.offsetY = h / 2;
                } else {
                    pin.view.offsetX = -5;
                    pin.view.offsetY = h / 4 + h / 2 * pin.index;
                }
            } else {
                pin.view.offsetX = w + 5;
                pin.view.offsetY = (h / 2);
            }
            pin.view.x = x + pin.view.offsetX;
            pin.view.y = y + pin.view.offsetY;
            var pinSvg = this.m_svgDrawer.circle(pinRadius * 2).center(pin.view.x, pin.view.y).attr({fill: '#4682b4'});
            pinSvg.remember('pin', pin);
            pinSvg.mousedown(this.pinMouseDown);
            pinSvg.mouseup(this.pinMouseUp);
            pinSvg.mouseover(this.pinMouseOver);
            pinSvg.mouseout(this.pinMouseOut);
            pin.view.svg = pinSvg;
        }
    };

    //
    // Remove the HTML/SVG elements associated with a block
    //
    this.undisplayBlock = function(block) {
        $('#b_' + block.id).remove();
        for (var i = 0; i < block.pins.length; i++) {
            var pin = block.pins[i];
            pin.view.svg.remove();
            if (pin.sourcePin) {  // remove connections to this block
                pin.view.svgConn.remove();
            }
        }

        //
        // Remove connections from this block
        //
        var destPins = this.m_diagram.findDestPins(block);
        for (var i = 0; i < destPins.length; i++) {
            destPins[i].view.svgConn.remove();
        }
    };

    //
    // Draw a connection between two blocks (as an SVG line)
    //
    this.displayConnection = function(destPin, scale) {
        var strokeWidth = 10 * scale;
        if (strokeWidth > 10) {
            strokeWidth = 10;
        } else if (strokeWidth < 4) {
            strokeWidth = 4;
        }
        var x1 = destPin.sourcePin.view.x;
        var y1 = destPin.sourcePin.view.y;
        var x2 = destPin.view.x;
        var y2 = destPin.view.y;
        var line = this.m_svgDrawer.line(x1, y1, x2, y2).stroke({width: strokeWidth, color: '#555'}).back();
        line.remember('destPin', destPin);
        line.click(connectionClick);
        destPin.view.svgConn = line;
    };

    //
    //
    //
    this.appendBlockParametersToBlockDiv = function(block, blockDiv) {
        for (var i = 0; i < block.params.length; i++) {
            var param = block.params[i];
            param.value = param['default']; // set value to default value so that we can send a value back to controller if no param entry change
            $('<div>', {class: 'flowBlockParamLabel', html: param.name}).appendTo(blockDiv);
            var input = $('<input>', {class: 'form-control flowBlockInput', type: 'text', id: 'bp_' + param.name, value: param['default']}).appendTo(blockDiv);
            input.mousedown(function(e) {e.stopPropagation()});
            input.keyup(block.id, paramEntryChanged);
        }
    };

    //
    // Scale css classes based on current scale value.
    // Will scale the following css classes:
    // - flowBlockValueAndUnits
    // - flowBlockValue
    // etc. as specified in CLASS_SCALING_TABLE
    //
    this.scaleClasses = function() {
        //
        // adjust css sizing properties based on scale
        //

        // allow reset to exactly 1.0 scale if it's slightly off
        if (this.m_scale > 0.95 && this.m_scale < 1.05) {
            do_reset = true;
            this.m_scale = 1.0;
        } else {
            do_reset = false;
        }
        for (var key in CLASS_SCALING_TABLE) {
          var node = $("." + key)
          if (node) {
            for (var cssProp in CLASS_SCALING_TABLE[key]) {
                var value = node.css(cssProp);
                if (value) {
                    var defaultValue = CLASS_SCALING_TABLE[key][cssProp];
                    var newValue = Math.round(defaultValue * this.m_scale);
                    // append "px" if needed
                    if (value && value.endsWith("px")) {
                        newValue = "" + newValue + "px";
                    }
                    //console.log("scaleClasses: " + key + " - " + cssProp + ": " + value + " -> " + newValue);
                    node.css(cssProp, newValue);
                    //$("." + key).css(cssProp, newValue);
                } else {
                    //console.log("scaleClasses: skipping " + key + " - " + cssProp);
                }
            }
          }
        }
    };

    //
    // Move a block along with its pins and connections
    //
    this.moveBlock = function(block, x, y) {

        //
        // Move block div
        //
        block.view.div.css('top', y + 'px');
        block.view.div.css('left', x + 'px');
        block.view.x = x;
        block.view.y = y;

        //
        // Move pins
        //
        for (var i = 0; i < block.pins.length; i++) {
            var pin = block.pins[i];
            pin.view.x = x + pin.view.offsetX;
            pin.view.y = y + pin.view.offsetY;
            pin.view.svg.center(pin.view.x, pin.view.y);
            if (pin.sourcePin) {
                _this.moveConn(pin);
            }
        }

        //
        // move connections
        //
        var destPins = _this.m_diagram.findDestPins(block);
        for (var i = 0; i < destPins.length; i++) {
            _this.moveConn(destPins[i]);
        }
    };

    //
    // Move a connection between two blocks
    //
    this.moveConn = function(destPin) {
        var x1 = destPin.sourcePin.view.x;
        var y1 = destPin.sourcePin.view.y;
        var x2 = destPin.view.x;
        var y2 = destPin.view.y;
        destPin.view.svgConn.plot(x1, y1, x2, y2);
    };

    //
    // Handle mouse moves in SVG area; move blocks or connections
    //
    this.mouseMove = function(e) {
        // console.log("[DEBUG] mouseMove");
        if (_this.m_activeStartPin) {
            var x1 = _this.m_activeStartPin.view.x;
            var y1 = _this.m_activeStartPin.view.y;
            var x2 = e.pageX;
            var y2 = e.pageY;
            if (_this.m_activeLineSvg) {
                _this.m_activeLineSvg.plot(x1, y1, x2, y2);
            } else {
                _this.m_activeLineSvg = _this.m_svgDrawer.line(x1, y1, x2, y2).stroke({width: 10, color: '#555'}).back();
            }
        }
        if (_this.m_dragBlock) {
            // console.log("[DEBUG] Dragging block.");
            var x = e.pageX;
            var y = e.pageY;
            _this.moveBlock(_this.m_dragBlock, 
                            x + _this.m_dragBlockOffsetX, 
                            y + _this.m_dragBlockOffsetY );
            _this.layoutModified();
        }
    };

    //
    // Call this when the visual appearance of the diagram is changed.
    //
    this.layoutModified = function() {
        _this.m_modified = true;
    };

    //
    // Handle mouse button up in SVG area
    //
    this.mouseUp = function(e) {

        // console.log("[DEBUG] mouseUp");

        _this.m_activeStartPin = null;
        _this.m_dragBlock = null;
        if (_this.m_activeLineSvg) {
            _this.m_activeLineSvg.remove();
            _this.m_activeLineSvg = null;
        }
    };

    //
    // Drag a block div
    //
    this.blockMouseDown = function(e) {
        var x = e.pageX;
        var y = e.pageY;

        //
        // Identify and store block
        //
        for (var i = 0; i < _this.m_diagram.blocks.length; i++) {
            var block = _this.m_diagram.blocks[i];
            var view = block.view;
            if (x >= view.x && x <= view.x + view.w && y >= view.y && y <= view.y + view.h) {
                // console.log("[DEBUG] moving block", block);
                _this.m_dragBlock = block;
                _this.m_dragBlockOffsetX = view.x - x;
                _this.m_dragBlockOffsetY = view.y - y;
            }
        }
    };

    //
    // Rename a block (using the block menu)
    //
    this.renameBlock = function(e) {
        var block = _this.m_diagram.findBlockById(e.data.id);
        if (block) {
            modalPrompt({
                title: 'Rename Block',
                prompt: 'New Name',
                default: block.name,
                validator: Util.diagramValidator,
                resultFunc: function(newName) {
                    block.name = newName;
                    $('#bn_' + block.id).html(newName);
                }
            });
        }
    };

    //
    // Delete a block (using the block menu)
    //
    this.deleteBlock = function(e) {
        var block = _this.m_diagram.findBlockById(e.data.id);
        if (block) {
            _this.undisplayBlock(block);        // remove UI elements
            _this.m_diagram.removeBlock(block);
            delete _this.nameHash[block.name];
        }
    };

    //
    // Display a dialog with a list of allowed filter types
    //
    this.showFilterBlockSelector = function() {
        var modal = createBasicModal('filterModal', 'Select a Filter', {infoOnly: true});
        modal.appendTo($('body'));
        var modalBody = $('#filterModal-body');
        var filterTypes = [
            "not", "and", "or", "xor", "nand",
            "plus", "minus", "times", "divided by", "absolute value",
            "equals", "not equals", "less than", "greater than",
            "simple moving average", "exponential moving average"
        ];
        for (var i = 0; i < filterTypes.length; i++) {
            var type = filterTypes[i];
            var button = $('<button>', {html: type, class: 'btn filter'});
            button.click(type, this.addFilterBlock);
            button.appendTo(modalBody);
        }
        $('#filterModal').modal('show');
    };

    //
    // Handle mouse down in pin SVG element
    //
    this.pinMouseDown = function(e) {
        // console.log("[DEBUG] pinMouseDown this", this);
        _this.m_activeStartPin = this.remember('pin');
    };

    //
    // Handle mouse up in pin SVG; create a new connection between blocks
    //
    this.pinMouseUp = function(e) {
        // console.log("[DEBUG] pinMouseUp this", this);
        var endPin = this.remember('pin');
        var startPin = _this.m_activeStartPin;
        if (startPin.isInput != endPin.isInput) {
            var sourcePin = endPin.isInput ? startPin : endPin;
            var destPin = endPin.isInput ? endPin : startPin;
            if (!destPin.sourcePin) {  // fix(later): remove existing connection and create new one
                destPin.sourcePin = sourcePin;
                _this.displayConnection(destPin, _this.m_scale);
            }
            _this.m_activeStartPin = null;
            _this.m_activeLineSvg.remove();
            _this.m_activeLineSvg = null;

            // CodapTest.logTopic('Dataflow/ConnectBlock');
        }
    };

    //
    // Highlight a pin when move mouse over it
    //
    this.pinMouseOver = function(e) {
        // console.log("[DEBUG] pinMouseOver this", this);
        this.fill({color: '#f06'})
    };

    //
    // Unhighlight a pin
    //
    this.pinMouseOut = function(e) {
        // console.log("[DEBUG] pinMouseOut this", this);
        this.fill({color: '#4682b4'})
    };

    //
    // Remove a connection by clicking on it; attached to connection SVG
    //
    this.connectionClick = function(e) {
        console.log("[DEBUG] connectionClick this", this);
        var destPin = this.remember('destPin');
        destPin.sourcePin = null;
        destPin.view.svgConn.remove();
    };

    //
    // Mapping used by addDeviceBlock() for sensor type units.
    //
    this.unitsMap = {
        humidity:       'percent',
        temperature:    'degrees C',
        CO2:            'PPM',
        light:          'lux',
        soilmoisture:   ''
    };

    //
    // Used by addDeviceBlock() to create unique names
    //
    this.nameHash = {};

    //
    // Determine if a block represents a physical sensor device
    //
    this.isDeviceBlock = function(type) {
        return (type == "temperature" ||
                type == "humidity" ||
                type == "light" ||
                type == "soilmoisture" ||
                type == "CO2" );
    };

    //
    // Used by addDeviceBlock() to create unique names
    //
    this.getUniqueName = function(name) {
    
        var block = this.nameHash[name];
        if(!block) {
            return name;
        }
        var count = 2;
        while(this.nameHash[name + " " + count]) { 
            count++;
        }
        return name + " " + count;
    };

    //
    // Add a block of the specified type to the program.
    //
    this.addDeviceBlock = function(type) {

        var offset = _this.m_diagram.blocks.length * 50;

        var name = _this.getUniqueName(type);

        var blockSpec = {
            name:           name,
            type:           type,
            units:          _this.unitsMap[type],
            has_seq:        true, // assume all inputs have sequences (for now)?
            input_type:     null,
            input_count:    0,
            output_type:    'n',
            output_count:   1,
            view: {
                x: 200 + offset,  // fix(later): smarter positioning
                y: 50 + offset,
            }
        };
        var block = createFlowBlock(blockSpec);
        _this.m_diagram.blocks.push(block);
        _this.nameHash[name] = block;
        _this.displayBlock(block);
        CodapTest.logTopic('Dataflow/ConnectSensor');
    };

    //
    // Add a filter block to the diagram
    //
    this.addFilterBlock = function(e) {
        var type = e.data;
        $('#filterModal').modal('hide');
        var blockSpec = {
            name: type,
            type: type,
            input_count: 2,
            output_count: 1,
            input_type: 'n',
            output_type: 'n',
        }
        if (type === 'not' || type == 'absolute value') {
            blockSpec.input_count = 1;
        }
        if (type === 'simple moving average'|| type === 'exponential moving average') {
            blockSpec.input_count = 1;
            blockSpec.type = "number_display_and_input"
            blockSpec.params = [{
                'name': 'period',
                'type': 'n',
                'min': 0,
                'max': 9999,
                'default': 10
            }];
        }
        if (type === 'blur' || type === 'brightness') {  // fix(soon): get this from controller block type spec list
            blockSpec.input_type = 'i';
            blockSpec.output_type = 'i';
            blockSpec.input_count = 1;
            if (type === 'blur') {
                blockSpec.params = [{
                    'name': 'blur_amount',
                    'type': 'n',
                    'min': 0,
                    'max': 50,
                    'default': 5,
                }];
            } else {
                blockSpec.params = [{
                    'name': 'brightness_adjustment',
                    'type': 'n',
                    'min': -100,
                    'max': 100,
                    'default': 0,
                }];
            }
        }
        var offset = _this.m_diagram.blocks.length * 50;
        var block = createFlowBlock(blockSpec);  // fix(soon): generate unique name from type
        _this.m_diagram.blocks.push(block);
        block.view.x = 200 + offset;
        block.view.y = 50 + offset;
        _this.displayBlock(block);
    };


    //
    // Add a numeric data entry block to the diagram
    //
    this.addNumericBlock = function() {
        var offset = _this.m_diagram.blocks.length * 50;

        var block = createFlowBlock(
                        {   name:           'number', 
                            type:           'number_entry', 
                            output_count:   1, 
                            output_type:    'n'    });

        _this.m_diagram.blocks.push(block);
        block.view.x = 200 + offset;
        block.view.y = 50 + offset;
        _this.displayBlock(block);
    };
    
    //
    // Add a plot block
    //
    this.addPlotBlock = function() {
        var offset = _this.m_diagram.blocks.length * 50;

        var block = createFlowBlock(
                        {   name:           'plot', 
                            type:           'plot', 
                            input_count:    1, 
                            input_type:     'n'     });

        _this.m_diagram.blocks.push(block);
        block.view.x = 200 + offset;
        block.view.y = 50 + offset;
        _this.displayBlock(block);
        CodapTest.logTopic('Dataflow/AddPlot');
    };

    //
    // Triggered when a numeric entry field is edited
    //
    this.numberEntryChanged = function(e) {
        var block = _this.m_diagram.findBlockById(e.data);
        var val = parseFloat($('#bv_' + block.id).val());
        if (isNaN(val)) {
            block.updateValue(null);
        } else {
            block.updateValue(val);
        }
        // fix(faster): only trigger if value has changed
    }

    //
    // Store the last received sensor data
    //
    this.receivedSensorData = {};

    //
    // Return an array containing block names for any sensor blocks that cannot 
    // be mapped to the last received sensor data.
    //
    this.getUnmappedSensors = function() {
        var ret = [];
        for (var i = 0; i < _this.m_diagram.blocks.length; i++) {
            var block = _this.m_diagram.blocks[i];
            if(_this.isDeviceBlock(block.type)) {
                if(!_this.receivedSensorData[block.name]) {
                    ret.push(block.name);
                }
            }
        }
        return ret;
    }

    //
    // Handle sensor data messages
    //
    this.handleSensorData = function(timestamp, params) {
        // console.log("[DEBUG] handleSensorData", params);
        if(params.data) {
            // console.log("[DEBUG] handleSensorData updating blocks.");
            _this.receivedSensorData = {};
            for(var i = 0; i < params.data.length; i++) {
                var sensor  = params.data[i];
                var name    = sensor.name;
                var value   = sensor.value;
                var block   = _this.nameHash[name];
                if (block) {
                    block.updateValue(value);
                    _this.displayBlockValue(block);
                }
                _this.receivedSensorData[name] = sensor;
            }

            //
            // Check for device blocks for which we did not receive any data
            // and set their values to null.
            //
            for (var i = 0; i < _this.m_diagram.blocks.length; i++) {
                var block = _this.m_diagram.blocks[i];
                if(_this.isDeviceBlock(block.type)) {
                    if(!_this.receivedSensorData[block.name]) {
                        block.updateValue(null);
                        _this.displayBlockValue(block);
                    }
                }
            }

            //
            // Now compute values for non-sensor blocks
            //
            // console.log("[DEBUG] diagram.update()");
            _this.m_diagram.update();

            //
            // Update UI
            //
            for (var i = 0; i < _this.m_diagram.blocks.length; i++) {
                _this.displayBlockValue(_this.m_diagram.blocks[i]);
            }
        }
    }

    //
    // Display the current value of a block in the UI
    //
    this.displayBlockValue = function(block) {
        if (block.type === 'number_entry') {
            // do nothing
        } else if (block.type === 'plot') {
            if (block.value !== null && !isNaN(block.value)) {
                var timestamp = moment().valueOf() * 0.001 - g_startTimestamp;
                block.view.xData.data.push(timestamp);
                block.view.yData.data.push(block.value);
                if (block.view.xData.data.length > 30) {
                    block.view.xData.data.shift();
                    block.view.yData.data.shift();
                }
            } else {
                block.view.xData.data = [];
                block.view.yData.data = [];
            }
            block.view.plotHandler.plotter.autoBounds();
            block.view.plotHandler.drawPlot(null, null);
        } else if (block.outputType === 'i') {  // image-valued blocks
            if (block.value === null) {
                // fix(soon): display something to let user know camera is offline
            } else {
                console.log('set image ' + block.value.length);
                $('#bi_' + block.id).attr('src', 'data:image/jpeg;base64,' + block.value);
            }
        } else {
            if (block.value === null) {
                $('#bv_' + block.id).html('...');
            } else {
                $('#bv_' + block.id).html(block.value);  // fix(faster): check whether value has changed
            }
        }
    }

    /**
     * zoom blocks
     * Params:
     *   blocks
     *   factor: factor to zoom by, such as 0.7 or 1.3
     */
    this.zoomBlocks = function(increment) {
        this.m_scale += increment;
        // var blocks = this.m_diagram.blocks;
        // for (var i = 0; i < blocks.length; i++) {
        //    blocks[i].view.x = Math.round(blocks[i].view.x * this.m_scale);
        //    blocks[i].view.y = Math.round(blocks[i].view.y * this.m_scale);
        // }
        this.redrawBlocks();
    }

    //
    // Redraw blocks. Usually called as part of scaling.
    //
    this.redrawBlocks = function() {
        if (this.m_diagram) {  // remove any existing diagram elements
            for (var i = 0; i < this.m_diagram.blocks.length; i++) {
                this.undisplayBlock(this.m_diagram.blocks[i]);
            }
            for (var i = 0; i < this.m_diagram.blocks.length; i++) {
                this.displayBlock(this.m_diagram.blocks[i]);
            }
        }
        // redraw connections
        for (var i = 0; i < this.m_diagram.blocks.length; i++) {
            var block = this.m_diagram.blocks[i];
            for (var j = 0; j < block.pins.length; j++) {
                var pin = block.pins[j];
                if (pin.sourcePin) {
                    this.displayConnection(pin, g_scale);
                }
            }
        }
    }

    return this;
}
