/**
  @author David Piegza

  Implements a sphere graph drawing with force-directed placement.

  It uses the force-directed-layout implemented in:
  https://github.com/davidpiegza/Graph-Visualization/blob/master/layouts/force-directed-layout.js

  Drawing is done with Three.js: http://github.com/mrdoob/three.js

  To use this drawing, include the graph-min.js file and create a SphereGraph object:

  <!DOCTYPE html>
  <html>
    <head>
      <title>Graph Visualization</title>
      <script type="text/javascript" src="path/to/graph-min.js"></script>
    </head>
    <body onload="new Drawing.SphereGraph({showStats: true, showInfo: true})">
    </bod>
  </html>

  Parameters:
  options = {
    layout: "2d" or "3d"

    showStats: <bool>, displays FPS box
    showInfo: <bool>, displays some info on the graph and layout
              The info box is created as <div id="graph-info">, it must be
              styled and positioned with CSS.


    selection: <bool>, enables selection of nodes on mouse over (it displays some info
               when the showInfo flag is set)


    limit: <int>, maximum number of nodes

    numNodes: <int> - sets the number of nodes to create.
    numEdges: <int> - sets the maximum number of edges for a node. A node will have
              1 to numEdges edges, this is set randomly.
  }


  Feel free to contribute a new drawing!

 */


var Drawing = Drawing || {};

Drawing.SphereGraph = function(options) {
  var options = options || {};

  //color fn and shaders from google globe JHE
  var colorFn = function(x) {
    var c = new THREE.Color();
    c.setHSL( ( 0.6 - ( x * 0.5 ) ), 1.0, 0.5 );
    return c;
  };

  var Shaders = {
    'earth' : {
      uniforms: {
        'texture': { type: 't', value: null }
      },
      vertexShader: [
        'varying vec3 vNormal;',
        'varying vec2 vUv;',
        'void main() {',
          'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
          'vNormal = normalize( normalMatrix * normal );',
          'vUv = uv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D texture;',
        'varying vec3 vNormal;',
        'varying vec2 vUv;',
        'void main() {',
          'vec3 diffuse = texture2D( texture, vUv ).xyz;',
          'float intensity = 1.05 - dot( vNormal, vec3( 0.0, 0.0, 1.0 ) );',
          'vec3 atmosphere = vec3( 1.0, 1.0, 1.0 ) * pow( intensity, 3.0 );',
          'gl_FragColor = vec4( diffuse + atmosphere, 1.0 );',
        '}'
      ].join('\n')
    },
    'atmosphere' : {
      uniforms: {},
      vertexShader: [
        'varying vec3 vNormal;',
        'void main() {',
          'vNormal = normalize( normalMatrix * normal );',
          'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vNormal;',
        'void main() {',
          'float intensity = pow( 0.8 - dot( vNormal, vec3( 0, 0, 1.0 ) ), 12.0 );',
          'gl_FragColor = vec4( 1.0, 1.0, 1.0, 1.0 ) * intensity;',
        '}'
      ].join('\n')
    }
  };
  // end shaders and colors from google globe JHE
  this.layout = options.layout || "2d";
  this.show_stats = options.showStats || false;
  this.show_info = options.showInfo || false;
  this.selection = options.selection || false;
  this.limit = options.limit || 10;
  this.nodes_count = options.numNodes || 20;
  this.edges_count = options.numEdges || 10;

  var camera, controls, scene, renderer, interaction, geometry, object_selection;
  var stats;
  var info_text = {};
  var graph = new Graph({limit: options.limit});

  var geometries = [];

  var sphere_radius = 5000;
  var max_X = sphere_radius;
  var min_X = -sphere_radius;
  var max_Y = sphere_radius;
  var min_Y = -sphere_radius;

  var that=this;

  init();
  createGraph();
  animate();

  function init() {
    // Three.js initialization
    renderer = new THREE.WebGLRenderer({alpha: true});
    renderer.setSize( window.innerWidth, window.innerHeight );

    camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 1, 100000);
    camera.position.z = 10000;

    controls = new THREE.TrackballControls(camera);

    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 5.2;
    controls.panSpeed = 1;

    controls.noZoom = false
    controls.noPan = false;

    controls.staticMoving = false;
    controls.dynamicDampingFactor = 0.3;

    controls.keys = [ 65, 83, 68 ];

    controls.addEventListener('change', render);

    scene = new THREE.Scene();

    //add sphere geometry from google globe JHE
    var geometry = new THREE.SphereGeometry(sphere_radius, 40, 30);

    shader = Shaders['earth'];
    uniforms = THREE.UniformsUtils.clone(shader.uniforms);

    uniforms['texture'].value = THREE.ImageUtils.loadTexture('./world.jpg');

    material = new THREE.ShaderMaterial({

          uniforms: uniforms,
          vertexShader: shader.vertexShader,
          fragmentShader: shader.fragmentShader

        });

    mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.y = Math.PI;
    scene.add(mesh);
    // end sphere geom JHE

    // Create node geometry (will be used in drawNode())
    geometry = new THREE.SphereGeometry( 50, 25, 0 );

    // Create node selection, if set
    if(that.selection) {
      object_selection = new THREE.ObjectSelection({
        domElement: renderer.domElement,
        selected: function(obj) {
          // display info
          if(obj != null) {
            info_text.select = "Object " + obj.id;
          } else {
            delete info_text.select;
          }
        }
      });
    }

    document.body.appendChild( renderer.domElement );

    // Stats.js
    if(that.show_stats) {
      stats = new Stats();
      stats.domElement.style.position = 'absolute';
      stats.domElement.style.top = '0px';
      document.body.appendChild( stats.domElement );
    }

    // Create info box
    if(that.show_info) {
      var info = document.createElement("div");
      var id_attr = document.createAttribute("id");
      id_attr.nodeValue = "graph-info";
      info.setAttributeNode(id_attr);
      document.body.appendChild( info );
    }
  }


  /**
   *  Creates a graph with random nodes and edges.
   *  Number of nodes and edges can be set with
   *  numNodes and numEdges.
   */
  function createGraph() {
    var cities = [
    {data: 'Bordeax', position: {x:44,y:0} },
    {data: 'Bangkok', position: {x:13,y:100} },
    {data: 'Bombay',  position: {x:19,y:72} },
    {data: 'Beijing', position:  {x:39,y:116} },
    {data: 'Berlin', position:   {x:52, y:13} },
    {data: 'Brisbane', position: {x:(-27),y:153} },
    {data: 'Santiago', position: {x:(-33),y:(-70)} }
    ]

    var nodes = [], targets = [];

    for(var i = 0; i < cities.length; i++){
      var node = new Node(i);
      node.data.name = cities[i].data;
      node.position = cities[i].position
      nodes.push(node);
      graph.addNode(node);
      drawNode(node);
    }

    while(nodes.length){
      var current = nodes.shift();
      for(var l = 0; l < nodes.length; l++){
        var target = nodes[l];
        if(graph.addEdge(current, target)) {
          drawEdge(current, target);
        }
      }
    }
    // var node = new Node(0);
    // graph.addNode(node);
    // drawNode(node);

    // var nodes = [];
    // nodes.push(node);

    // var steps = 1;
    // while(nodes.length != 0 && steps < that.nodes_count) {
    //   var node = nodes.shift();

    //   var numEdges = randomFromTo(1, that.edges_count);
    //   for(var i=1; i <= numEdges; i++) {
    //     var target_node = new Node(i*steps);
    //     if(graph.addNode(target_node)) {
    //       drawNode(target_node);
    //       nodes.push(target_node);
    //       if(graph.addEdge(node, target_node)) {
    //         drawEdge(node, target_node);
    //       }
    //     }
    //   }
    //   steps++;
    // }

    // Transform a lat, lng-position to x,y.
    // graph.layout = new Layout.ForceDirected(graph, {width: 2000, height: 2000, iterations: 1000, positionUpdated: function(node) {
    //   max_X = Math.max(max_X, node.position.x);
    //   min_X = Math.min(min_X, node.position.x);
    //   max_Y = Math.max(max_Y, node.position.y);
    //   min_Y = Math.min(min_Y, node.position.y);


    //   var lat, lng;
    //   lat = node.position.x;
    //   lng = node.position.y;
    //   // if(node.position.x < 0) {
    //   //   lat = (-90/min_X) * node.position.x;
    //   // } else {
    //   //   lat = (90/max_X) * node.position.x;
    //   // }
    //   // if(node.position.y < 0) {
    //   //   lng = (-180/min_Y) * node.position.y;
    //   // } else {
    //   //   lng = (180/max_Y) * node.position.y;
    //   // }

    //   var area = 5000;
    //   var phi = (90 - lat) * Math.PI / 180;
    //   var theta = (180 - lng) * Math.PI / 180;
    //   node.data.draw_object.position.x = area * Math.sin(phi) * Math.cos(theta);
    //   node.data.draw_object.position.y = area * Math.cos(phi);
    //   node.data.draw_object.position.z = area * Math.sin(phi) * Math.sin(theta);

    // }});
    // graph.layout.init();
    // info_text.nodes = "Nodes " + graph.nodes.length;
    // info_text.edges = "Edges " + graph.edges.length;
  }


  /**
   *  Create a node object and add it to the scene.
   */
  function drawNode(node) {
    var draw_object = new THREE.Mesh( geometry, new THREE.MeshBasicMaterial( {  color: Math.random() * 0xffffff } ) );

    var area = 5000;
      var phi = (90 - node.position.x) * Math.PI / 180;
      var theta = (180 - node.position.y) * Math.PI / 180;
      node.position.x = area * Math.sin(phi) * Math.cos(theta);
      node.position.y = area * Math.cos(phi);
      node.position.z = area * Math.sin(phi) * Math.sin(theta);

    draw_object.id = node.id;
    node.data.draw_object = draw_object;
    node.layout = {}
    node.layout.max_X = 90;
    node.layout.min_X = -90;
    node.layout.max_Y = 180;
    node.layout.min_Y = -180;

    node.data.draw_object.position = node.position;
    scene.add( node.data.draw_object );
  }


  /**
   *  Create an edge object (line) and add it to the scene.
   */
  function drawEdge(source, target) {
    // material = new THREE.LineBasicMaterial( { color: 0xCCCCCC, opacity: 0.5, linewidth: 1 } );
    // var tmp_geo = new THREE.Geometry();
    // tmp_geo.vertices.push(source.position);
    // tmp_geo.vertices.push(target.position);

    // line = new THREE.Line( tmp_geo, material, THREE.LinePieces );
    // line.scale.x = line.scale.y = line.scale.z = 1;
    // line.originalScale = 1;

    // geometries.push(tmp_geo);

    // scene.add( line );
    var sourceXy = source.position;
    var targetXy = target.position;
    var AvgX = (sourceXy['x'] + targetXy['x']) / 2;
    var AvgY = (sourceXy['y'] + targetXy['y']) / 2;
    var AvgZ = (sourceXy['z'] + targetXy['z']) / 2;
    var diffX = Math.abs(sourceXy['x'] - targetXy['x']);
    var diffY = Math.abs(sourceXy['y'] - targetXy['y']);
    var middle = [ AvgX, AvgY, AvgZ + (diffX+diffY/1.3) ];
    if(target.data.name === "Santiago"){
    }
    var curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(sourceXy['x'], sourceXy['y'], sourceXy['z']), new THREE.Vector3(middle[0], middle[1], middle[2]), new THREE.Vector3(targetXy['x'], targetXy['y'], targetXy['z']));
    var path = new THREE.CurvePath();
    path.add(curve);
    var curveMaterial = new THREE.LineBasicMaterial({
      color: "red", linewidth: 2
    });
    curvedLine = new THREE.Line(path.createPointsGeometry(400), curveMaterial);
    curvedLine.lookAt(new THREE.Vector3(0,0,0));
    scene.add(curvedLine);
  }


  function animate() {
    requestAnimationFrame( animate );
    controls.update();
    render();
    if(that.show_info) {
      printInfo();
    }
  }


  function render() {
    // Generate layout if not finished
    // if(!graph.layout.finished) {
    //   info_text.calc = "<span style='color: red'>Calculating layout...</span>";
    //   graph.layout.generate();
    // } else {
    //   info_text.calc = "";
    // }

    // Update position of lines (edges)
    for(var i=0; i<geometries.length; i++) {
      geometries[i].verticesNeedUpdate = true;
    }

    // set lookat of nodes to camera
    for(var i=0; i<graph.nodes.length; i++) {
      graph.nodes[i].data.draw_object.lookAt(camera.position);
    }

    // render selection
    if(that.selection) {
      object_selection.render(scene, camera);
    }

    // update stats
    if(that.show_stats) {
      stats.update();
    }

    // render scene
    renderer.render( scene, camera );
  }


  /**
   *  Prints info from the attribute info_text.
   */
  function printInfo(text) {
    var str = '';
    for(var index in info_text) {
      if(str != '' && info_text[index] != '') {
        str += " - ";
      }
      str += info_text[index];
    }
    document.getElementById("graph-info").innerHTML = str;
  }


  // Generate random number
  function randomFromTo(from, to) {
    return Math.floor(Math.random() * (to - from + 1) + from);
  }

  // Stop layout calculation
  this.stop_calculating = function() {
    graph.layout.stop_calculating();
  }
}
